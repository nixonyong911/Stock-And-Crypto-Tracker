import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import {
  buildMarketSnapshot,
  synthesizeOverview,
  synthesizeOverviewCore,
  formatMorningBrief,
  formatEveningRecap,
  buildTemplateFallbackNarrative,
  fetchPriorOverviews,
  fetchStockPriceTrajectory,
  fetchCryptoPriceTrajectory,
  type MarketSnapshot,
} from "./market-overview.js";
import {
  computeOverviewSnapshotHash,
  computeOverviewContextHash,
  projectSnapshotRefs,
  gatherContextRefs,
  CURRENT_OVERVIEW_SCHEMA_VERSION,
  CURRENT_OVERVIEW_GENERATOR_VERSION,
  CURRENT_OVERVIEW_PROMPT_VERSION,
  CURRENT_OVERVIEW_MODEL,
  CURRENT_CODE_VERSION,
} from "./daily-overview-fingerprint.js";
import {
  getCurrentOverviewArtifact,
  acquireOverviewSlot,
  markOverviewGenerating,
  markOverviewReady,
  markOverviewFailed,
} from "./daily-overview-repository.js";

const SEND_DELAY_MS = 50;
const ALLOWED_USERS = (process.env["OVERVIEW_ALLOWED_USERS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const TRAJECTORY_SYMBOLS = ["SPX500", "OIL"];
const TRAJECTORY_CRYPTO = ["BTC/USD", "ETH/USD"];
const HISTORY_DAYS = 7;

export interface BroadcastDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
  canonicalArtifactEnabled?: boolean;
  triggerReason?: string;
}

export interface BroadcastResult {
  sent: number;
  skipped: number;
  errors: number;
}

function classifyOverviewError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timed out")) return "llm_timeout";
  if (msg.includes("exited with code")) return "llm_exit_nonzero";
  if (msg.includes("ENOENT") || msg.includes("spawn")) return "llm_spawn_failed";
  return "unknown";
}

async function synthesizeViaArtifact(
  deps: BroadcastDeps,
  snapshot: MarketSnapshot,
  sessionType: "pre_market" | "post_close",
  dateStr: string,
): Promise<{ narrative: string; topStories: string[] } | null> {
  const locale = "en";
  const snapshotHash = computeOverviewSnapshotHash(snapshot);
  const contextRefs = await gatherContextRefs(deps.db, sessionType);
  const contextHash = computeOverviewContextHash(contextRefs);

  const existing = await getCurrentOverviewArtifact({
    db: deps.db,
    overviewDate: dateStr,
    sessionType,
    locale,
    snapshotHash,
    contextHash,
    schemaVersion: CURRENT_OVERVIEW_SCHEMA_VERSION,
    generatorVersion: CURRENT_OVERVIEW_GENERATOR_VERSION,
    promptVersion: CURRENT_OVERVIEW_PROMPT_VERSION,
    modelName: CURRENT_OVERVIEW_MODEL,
  });
  if (existing) {
    deps.log.info(
      { overviewId: existing.overview_id, sessionType, dateStr },
      "Reusing existing daily overview artifact",
    );
    return {
      narrative: existing.narrative ?? "",
      topStories: (existing.top_stories as string[] | null) ?? [],
    };
  }

  const slot = await acquireOverviewSlot({
    db: deps.db,
    overviewDate: dateStr,
    sessionType,
    locale,
    triggerReason: deps.triggerReason ?? `cron:${sessionType}`,
    snapshotRefs: projectSnapshotRefs(snapshot) as unknown as Record<string, unknown>,
    snapshotHash,
    contextHash,
    schemaVersion: CURRENT_OVERVIEW_SCHEMA_VERSION,
    generatorVersion: CURRENT_OVERVIEW_GENERATOR_VERSION,
    promptVersion: CURRENT_OVERVIEW_PROMPT_VERSION,
    modelName: CURRENT_OVERVIEW_MODEL,
    codeVersion: CURRENT_CODE_VERSION,
  });
  if (!slot) {
    deps.log.warn(
      { dateStr, sessionType },
      "Overview slot owned by other worker; falling back to legacy synth",
    );
    return synthesizeOverview(snapshot, deps.db, deps.redis, deps.log);
  }

  await markOverviewGenerating(deps.db, slot.id);

  const [priorOverviews, stockTrajectory, cryptoTrajectory] = await Promise.all([
    fetchPriorOverviews(deps.db, HISTORY_DAYS).catch(() => []),
    fetchStockPriceTrajectory(deps.db, TRAJECTORY_SYMBOLS, HISTORY_DAYS).catch(() => []),
    fetchCryptoPriceTrajectory(deps.db, TRAJECTORY_CRYPTO, HISTORY_DAYS).catch(() => []),
  ]);

  try {
    const core = await synthesizeOverviewCore({
      snapshot,
      priorOverviews,
      stockTrajectory,
      cryptoTrajectory,
      model: CURRENT_OVERVIEW_MODEL,
      log: deps.log,
    });

    if (!core) {
      const fallbackNarrative = buildTemplateFallbackNarrative(snapshot);
      await markOverviewReady({
        db: deps.db,
        id: slot.id,
        synthesisSource: "template_fallback",
        payload: { synthesis: { narrative: fallbackNarrative, topStories: [] }, sessionType },
        narrative: fallbackNarrative,
        topStories: [],
        messageBody: null,
        llmDurationMs: null,
      });
      return { narrative: fallbackNarrative, topStories: [] };
    }

    await markOverviewReady({
      db: deps.db,
      id: slot.id,
      synthesisSource: "llm",
      payload: { synthesis: { narrative: core.narrative, topStories: core.topStories }, sessionType },
      narrative: core.narrative,
      topStories: core.topStories,
      messageBody: null,
      llmDurationMs: core.durationMs,
    });
    return { narrative: core.narrative, topStories: core.topStories };
  } catch (err) {
    await markOverviewFailed({
      db: deps.db,
      id: slot.id,
      errorCode: classifyOverviewError(err),
      errorMessage: String((err as Error)?.message ?? err).slice(0, 1024),
      errorStack: String((err as Error)?.stack ?? "").slice(0, 4096),
    });
    const fallbackNarrative = buildTemplateFallbackNarrative(snapshot);
    return { narrative: fallbackNarrative, topStories: [] };
  }
}

export async function broadcastDailyOverview(
  deps: BroadcastDeps,
  sessionType: "pre_market" | "post_close",
): Promise<BroadcastResult> {
  const { db, redis, extensions, log } = deps;
  const dateStr = new Date().toISOString().slice(0, 10);
  const dedupKey = `digest:overview:sent:${dateStr}:${sessionType}`;

  const alreadySent = await redis.get(dedupKey);
  if (alreadySent) {
    log.info({ sessionType, dateStr }, "Daily overview already sent, skipping");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const telegram = extensions.get("telegram");
  if (!telegram) {
    log.warn("Telegram extension not available, cannot broadcast overview");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  log.info({ sessionType }, "Building market snapshot for daily overview");

  const snapshot = await buildMarketSnapshot(db, sessionType);

  if (snapshot.indices.length === 0 && snapshot.crypto.length === 0) {
    log.warn("No market data available for overview, skipping broadcast");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  let synthesis: { narrative: string; topStories: string[] } | null;

  if (deps.canonicalArtifactEnabled) {
    synthesis = await synthesizeViaArtifact(deps, snapshot, sessionType, dateStr);
  } else {
    synthesis = await synthesizeOverview(snapshot, db, redis, log);
  }

  const message = sessionType === "pre_market"
    ? formatMorningBrief(snapshot, synthesis)
    : formatEveningRecap(snapshot, synthesis);

  const allowlistClause = ALLOWED_USERS.length > 0
    ? `AND ca.clerk_user_id IN (${ALLOWED_USERS.map((_, i) => `$${i + 1}`).join(", ")})`
    : "";

  const recipients = await db.query<{
    clerk_user_id: string;
    platform_user_id: string;
  }>(
    `SELECT DISTINCT ca.clerk_user_id, ca.platform_user_id
     FROM channel_accounts ca
     JOIN gateway_sessions gs
       ON gs.clerk_user_id = ca.clerk_user_id
       AND gs.channel_type = 'telegram'
       AND gs.expires_at > NOW()
     LEFT JOIN user_digest_preferences dp
       ON dp.clerk_user_id = ca.clerk_user_id
     WHERE ca.channel_type = 'telegram'
       AND COALESCE(dp.daily_overview_enabled, true) = true
       ${allowlistClause}`,
    ALLOWED_USERS.length > 0 ? ALLOWED_USERS : undefined,
  );

  log.info(
    { sessionType, recipientCount: recipients.rows.length },
    "Broadcasting daily overview",
  );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const recipient of recipients.rows) {
    try {
      const result = await telegram.sendText({
        platformChatId: recipient.platform_user_id,
        text: message,
        parseMode: "Markdown",
      });

      if (result.ok) {
        sent++;
        await db
          .query(
            `INSERT INTO user_recommendation_log
             (clerk_user_id, ticker_symbol, recommendation_type, priority, headline, message_body, timeframe_alignment)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              recipient.clerk_user_id,
              "MARKET",
              "daily_overview",
              "low",
              `Daily ${sessionType === "pre_market" ? "Morning Brief" : "Market Recap"}`,
              message,
              "full",
            ],
          )
          .catch((err) => log.error({ err }, "Failed to log overview send"));
      } else {
        skipped++;
      }

      if (SEND_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      }
    } catch (err) {
      errors++;
      log.error(
        { err, clerkUserId: recipient.clerk_user_id },
        "Failed to send daily overview",
      );
    }
  }

  await redis.set(dedupKey, "1", "EX", 43200).catch(() => {});

  log.info(
    { sessionType, sent, skipped, errors },
    "Daily overview broadcast complete",
  );

  return { sent, skipped, errors };
}
