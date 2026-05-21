import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import {
  buildMarketSnapshot,
  formatMorningBrief,
  formatEveningRecap,
} from "./market-overview.js";
import {
  orchestrateDailyOverviewArtifact,
} from "./daily-overview-orchestrator.js";
import { newRunContext } from "./artifact-logging.js";
import type { ArtifactTriggerSource } from "./artifact-trigger.js";
import type { ArtifactRef } from "./digest-delivery.js";
import type { DeliveryFailureReason } from "./delivery-failure.js";
import { loadAlreadyDeliveredUserIds } from "./delivery-ledger-queries.js";

const SEND_DELAY_MS = 50;

export interface BroadcastDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
  triggerReason?: string;
  triggerSource?: ArtifactTriggerSource;
}

export interface BroadcastResult {
  sent: number;
  skipped: number;
  errors: number;
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

  const runCtx = newRunContext("daily_overview");
  log.info(
    { runId: runCtx.runId, artifactType: "daily_overview", sessionType },
    "Starting artifact-based daily overview synthesis",
  );
  const result = await orchestrateDailyOverviewArtifact(
    { db, log, triggerSource: deps.triggerSource },
    runCtx,
    snapshot,
    sessionType,
    dateStr,
  );
  log.info(
    { runId: runCtx.runId, source: result.source, durationMs: result.durationMs },
    "Artifact orchestration complete",
  );
  const synthesis: { narrative: string; topStories: string[] } | null = result.brief
    ? { narrative: result.brief.narrative, topStories: result.brief.topStories }
    : null;
  const artifactRef: ArtifactRef | null = result.artifactId != null
    ? { kind: "daily_overview", id: result.artifactId }
    : null;

  const message = sessionType === "pre_market"
    ? formatMorningBrief(snapshot, synthesis)
    : formatEveningRecap(snapshot, synthesis);

  // Step 15.2 (slice F): the OVERVIEW_ALLOWED_USERS allowlist — a 14.2-era
  // staging guardrail — is removed. Daily overview is now production-cutover
  // and uses `daily_overview_enabled` prefs only.
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
       AND COALESCE(dp.daily_overview_enabled, true) = true`,
  );

  // Step 15.2 (slice C): authoritative per-user dedup against the ledger.
  // The Redis short-circuit above remains the cheap fast-path; this is
  // the second gate that survives Redis TTL expiry / crash recovery /
  // manual replay.
  let alreadyDeliveredUserIds: Set<string> = new Set();
  if (artifactRef) {
    try {
      alreadyDeliveredUserIds = await loadAlreadyDeliveredUserIds(db, artifactRef);
    } catch (err) {
      log.error(
        { err, artifact: artifactRef },
        "Failed to load already-delivered user IDs; proceeding without per-user dedup",
      );
    }
  }

  log.info(
    {
      sessionType,
      recipientCount: recipients.rows.length,
      alreadyDeliveredCount: alreadyDeliveredUserIds.size,
    },
    "Broadcasting daily overview",
  );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const recipient of recipients.rows) {
    if (alreadyDeliveredUserIds.has(recipient.clerk_user_id)) {
      skipped++;
      continue;
    }

    let deliveryStatus: "sent" | "failed" = "failed";
    let deliveryFailureReason: DeliveryFailureReason | null = null;

    try {
      const result = await telegram.sendText({
        platformChatId: recipient.platform_user_id,
        text: message,
        parseMode: "Markdown",
      });

      if (result.ok) {
        sent++;
        deliveryStatus = "sent";
      } else {
        skipped++;
        deliveryFailureReason = "send_failed";
      }

      if (SEND_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      }
    } catch (err) {
      errors++;
      deliveryFailureReason = "send_error";
      log.error(
        { err, clerkUserId: recipient.clerk_user_id },
        "Failed to send daily overview",
      );
    }

    // Step 15.2 (slice G): synthetic denorm placeholders are now NULL.
    // The artifact (`analysis_daily_overview`) is the source of truth for
    // narrative / top stories. `recommendation_type` stays populated as the
    // legitimate row-type discriminator that RUNBOOK §4 audit queries
    // group by. `ticker_symbol` is now nullable per migration 026.
    await db
      .query(
        `INSERT INTO user_recommendation_log
         (clerk_user_id, ticker_symbol, recommendation_type, priority, headline,
          message_body, timeframe_alignment,
          artifact_kind, artifact_id,
          channel_type, delivery_status, delivery_failure_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          recipient.clerk_user_id,
          null,
          "daily_overview",
          null,
          null,
          null,
          null,
          artifactRef?.kind ?? null,
          artifactRef?.id ?? null,
          "telegram",
          deliveryStatus,
          deliveryFailureReason,
        ],
      )
      .catch((err) => log.error({ err }, "Failed to log overview delivery"));
  }

  await redis.set(dedupKey, "1", "EX", 43200).catch(() => {});

  log.info(
    { sessionType, sent, skipped, errors },
    "Daily overview broadcast complete",
  );

  return { sent, skipped, errors };
}
