import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { GatewayConfig } from "../config.js";
import type { ExtensionRegistry } from "../extension/registry.js";
import { detectSignalsForTicker } from "../core/analysis/recommendation-engine.js";
import { broadcastDailyOverview } from "../core/analysis/daily-overview-broadcaster.js";
import { generateDigestBrief } from "../core/analysis/digest-brief-generator.js";
import {
  gatherTruth,
  deriveSignals,
} from "../core/analysis/digest-brief-truth.js";
import { processUnfilteredNews } from "../core/analysis/news-processor.js";
import { curateMarketMemory } from "../core/analysis/memory-curator.js";
import { processRecommendations } from "../core/analysis/digest-pipeline.js";
import { canReceiveSmartDigest } from "../core/analysis/digest-eligibility.js";
import {
  renderSmartDigestCard,
  deliverSmartDigest,
} from "../core/analysis/digest-delivery.js";
import { buildDigestDebugReport } from "../core/analysis/digest-debug.js";
import type { BriefMode } from "../core/analysis/digest-brief-truth.js";
import { selectByDigestId, listRecent } from "../core/analysis/smart-digest-repository.js";
import { selectByOverviewId, listRecentOverviews } from "../core/analysis/daily-overview-repository.js";

interface CheckRecommendationsBody {
  assetType?: "stock" | "crypto";
}

// ---------------------------------------------------------------------------
// HTTP route
// ---------------------------------------------------------------------------

export function registerRecommendationRoutes(
  app: FastifyInstance,
  deps: {
    config: GatewayConfig;
    db: Pool;
    redis: Redis;
    extensions: ExtensionRegistry;
  },
): void {
  const { config, db, redis, extensions } = deps;

  app.post<{ Body: CheckRecommendationsBody }>(
    "/internal/check-recommendations",
    async (request, reply) => {
      const serviceKey = request.headers["x-service-key"] as string | undefined;
      if (
        !config.internalServiceKey ||
        !serviceKey ||
        serviceKey !== config.internalServiceKey
      ) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const result = await processRecommendations(
          {
            db,
            redis,
            extensions,
            log: app.log,
            briefMode: config.smartDigestBriefBlend ? "blended" : "strict",
            canonicalArtifactEnabled:
              config.smartDigestCanonicalArtifactEnabled,
          },
          request.body?.assetType,
        );
        return reply.send({ ok: true, ...result });
      } catch (err) {
        app.log.error({ err }, "Error checking recommendations");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  app.post<{
    Body: {
      sessionType?: "pre_market" | "post_close";
      overviewId?: string;
    };
  }>(
    "/internal/trigger-overview",
    async (request, reply) => {
      const serviceKey = request.headers["x-service-key"] as string | undefined;
      if (
        !config.internalServiceKey ||
        !serviceKey ||
        serviceKey !== config.internalServiceKey
      ) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const overviewId = request.body?.overviewId?.trim();
      if (overviewId) {
        try {
          const artifact = await selectByOverviewId(db, overviewId);
          if (!artifact) {
            return reply.status(404).send({ error: "Overview artifact not found" });
          }
          return reply.send({ ok: true, artifact });
        } catch (err) {
          app.log.error(
            { err, overviewId },
            "Error fetching overview artifact by overviewId",
          );
          return reply.status(500).send({ error: "Internal server error" });
        }
      }

      try {
        const sessionType = request.body?.sessionType ?? "post_close";
        const result = await broadcastDailyOverview(
          {
            db,
            redis,
            extensions,
            log: app.log,
            canonicalArtifactEnabled:
              config.dailyOverviewCanonicalArtifactEnabled,
            triggerReason: "http:trigger",
            triggerSource: "http_trigger" as const,
          },
          sessionType,
        );
        return reply.send({ ok: true, ...result });
      } catch (err) {
        app.log.error({ err }, "Error triggering daily overview");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  const telegramNotify = buildTelegramNotify(config);

  app.post(
    "/internal/process-news",
    async (request, reply) => {
      const serviceKey = request.headers["x-service-key"] as string | undefined;
      if (
        !config.internalServiceKey ||
        !serviceKey ||
        serviceKey !== config.internalServiceKey
      ) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const result = await processUnfilteredNews({
          db,
          redis,
          log: app.log,
          curatorModel: config.curatorModel,
          telegramNotify,
          curatorSequentialBatches: config.curatorSequentialBatches,
          curatorVerboseLogs: config.curatorVerboseLogs,
          curatorTelegramErrorMaxChars: config.curatorTelegramErrorMaxChars,
          curatorLlmTimeoutMs: config.curatorLlmTimeoutMs,
          curatorMaxStories: config.curatorMaxStories,
          curatorMaxStoriesPerBatch: config.curatorMaxStoriesPerBatch,
        });
        return reply.send({ ok: true, ...result });
      } catch (err) {
        app.log.error({ err }, "Error processing unfiltered news");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );
  app.post(
    "/internal/curate-memory",
    async (request, reply) => {
      const serviceKey = request.headers["x-service-key"] as string | undefined;
      if (
        !config.internalServiceKey ||
        !serviceKey ||
        serviceKey !== config.internalServiceKey
      ) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const result = await curateMarketMemory({
          db,
          redis,
          log: app.log,
          curatorModel: config.curatorModel,
          telegramNotify,
          sequentialBatches: config.curatorSequentialBatches,
          verboseCuratorLogs: config.curatorVerboseLogs,
          curatorTelegramErrorMaxChars: config.curatorTelegramErrorMaxChars,
          llmTimeoutMs: config.curatorLlmTimeoutMs,
          maxStoriesForCurator: config.curatorMaxStories,
          maxStoriesPerBatch: config.curatorMaxStoriesPerBatch,
        });
        return reply.send({ ok: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        app.log.error({ err, memoryCurationErrorMessage: msg, stack }, "Error running memory curator");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  app.post<{
    Body: {
      clerkUserId: string;
      symbol: string;
      assetType?: "stock" | "crypto";
      /**
       * Reserved flag retained for backward compatibility. Currently ignored —
       * when signals are present the endpoint always renders the card and
       * delivers it via Telegram; when no signals exist it returns
       * `{ ok: true, generated: false, reason: "no_signals_for_symbol" }`.
       */
      notifyOnNoSignals?: boolean;
      /**
       * When `true`, returns `{ ok, generated, brief, truth }` and skips
       * `deliverSmartDigest` entirely — no Telegram send, no
       * `user_recommendation_log` insert. Eligibility is still checked so
       * the dry-run mirrors the real flow's gating.
       */
      dryRun?: boolean;
    };
  }>(
    "/internal/force-send-digest",
    async (request, reply) => {
      const serviceKey = request.headers["x-service-key"] as string | undefined;
      if (
        !config.internalServiceKey ||
        !serviceKey ||
        serviceKey !== config.internalServiceKey
      ) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const clerkUserId = request.body?.clerkUserId?.trim();
      const rawSym = request.body?.symbol?.trim();
      const symbol = rawSym ? rawSym.toUpperCase() : "";
      const assetType = request.body?.assetType === "crypto" ? "crypto" : "stock";
      const dryRun = request.body?.dryRun === true;
      const briefMode = config.smartDigestBriefBlend ? "blended" : "strict";

      if (!clerkUserId || !symbol) {
        return reply.status(400).send({ error: "clerkUserId and symbol required" });
      }

      try {
        // Force-send deliberately bypasses the throttle gate (prefs + cap):
        // this is the manual verification path, and we keep the legacy
        // semantics where `/internal/force-send-digest` always sends if the
        // user has an active session, paired Telegram, and watches the symbol.
        const eligibility = await canReceiveSmartDigest(
          { db, redis },
          clerkUserId,
          symbol,
          { applyThrottle: false },
        );
        if (!eligibility.ok) {
          return reply.status(404).send({
            error:
              "No Telegram session or symbol not on watchlist for this clerk user",
          });
        }

        const {
          signals,
          macroContext,
          newsOneLinerMap,
          memoryTextMap,
          analysisDateMap,
        } = await detectSignalsForTicker(db, symbol, assetType);

        if (signals.length === 0) {
          return reply.send({
            ok: true,
            generated: false,
            reason: "no_signals_for_symbol",
            symbol,
            assetType,
          });
        }

        const brief = generateDigestBrief({
          signals,
          symbol,
          macroContext,
          newsOneLinerMap,
          memoryTextMap,
          analysisDateMap,
          mode: briefMode,
        });
        const primary = signals[0]!;

        // Build a `truth` projection for DB-source-of-truth verification.
        // This is the same `BriefTruth` the generator consumed internally —
        // returning it makes manual cross-checks against pgAdmin trivial.
        const memoryText = memoryTextMap.get(symbol.toUpperCase());
        const analysisDate = analysisDateMap.get(symbol.toUpperCase());
        const truth = gatherTruth({
          signal: primary,
          macroContext,
          memoryText:
            primary.type === "news_sentiment" ? undefined : memoryText,
          analysisDate,
        });
        const derived = deriveSignals(truth);

        if (dryRun) {
          return reply.send({
            ok: true,
            generated: true,
            dryRun: true,
            symbol: primary.symbol,
            signalType: primary.type,
            headline: primary.headline,
            brief,
            truth,
            derived,
          });
        }

        const rendered = await renderSmartDigestCard(brief, app.log);
        const delivery = await deliverSmartDigest(
          { db, extensions, log: app.log },
          eligibility.target,
          brief,
          primary,
          rendered,
        );

        return reply.send({
          ok: true,
          generated: true,
          symbol: primary.symbol,
          signalType: primary.type,
          headline: primary.headline,
          brief,
          delivery,
        });
      } catch (err) {
        app.log.error({ err }, "Error in force-send-digest");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  // ---------------------------------------------------------------------
  // Smart Digest debug inspection
  //
  // Returns the full structured `DigestDebugReport` for a single symbol —
  // raw truth, all candidate signals + ranking mechanics, every
  // `analysis_market_memory` candidate considered for context (not just
  // the chosen one), source freshness, fallback flags, and the final
  // `DigestBrief`.
  //
  // Side effects: none. Does NOT send Telegram, does NOT write to
  // `user_recommendation_log`, does NOT mutate Redis. Auth via the same
  // `x-service-key` the other `/internal/*` routes use. Symbol-only:
  // no `clerkUserId` required, so any symbol can be inspected without a
  // real watcher.
  // ---------------------------------------------------------------------
  app.post<{
    Body: {
      symbol: string;
      assetType?: "stock" | "crypto";
      mode?: BriefMode;
      digestId?: string;
    };
  }>("/internal/debug-digest", async (request, reply) => {
    const serviceKey = request.headers["x-service-key"] as string | undefined;
    if (
      !config.internalServiceKey ||
      !serviceKey ||
      serviceKey !== config.internalServiceKey
    ) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const digestId = request.body?.digestId?.trim();
    if (digestId) {
      try {
        const artifact = await selectByDigestId(db, digestId);
        if (!artifact) {
          return reply.status(404).send({ error: "Artifact not found" });
        }
        return reply.send({ ok: true, artifact });
      } catch (err) {
        app.log.error(
          { err, digestId },
          "Error fetching artifact by digestId",
        );
        return reply.status(500).send({ error: "Internal server error" });
      }
    }

    const rawSym = request.body?.symbol?.trim();
    if (!rawSym) {
      return reply.status(400).send({ error: "symbol required" });
    }
    const symbol = rawSym.toUpperCase();
    const assetType = request.body?.assetType === "crypto" ? "crypto" : "stock";
    const requestedMode = request.body?.mode;
    const mode: BriefMode =
      requestedMode === "blended" || requestedMode === "strict"
        ? requestedMode
        : config.smartDigestBriefBlend
          ? "blended"
          : "strict";

    try {
      const report = await buildDigestDebugReport(
        { db, log: app.log },
        { symbol, assetType, mode },
      );
      return reply.send({ ok: true, ...report });
    } catch (err) {
      app.log.error(
        { err, symbol, assetType },
        "Error building debug-digest report",
      );
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // ── Admin: recent artifacts listing ──────────────────────────────────

  app.get<{
    Querystring: {
      kind?: "smart_digest" | "daily_overview";
      limit?: string;
      symbol?: string;
      sessionType?: string;
    };
  }>("/internal/artifacts/recent", async (request, reply) => {
    const serviceKey = request.headers["x-service-key"] as string | undefined;
    if (
      !config.internalServiceKey ||
      !serviceKey ||
      serviceKey !== config.internalServiceKey
    ) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const kind = request.query.kind ?? "smart_digest";
    const limit = Math.min(Number(request.query.limit) || 20, 100);

    try {
      if (kind === "daily_overview") {
        const rows = await listRecentOverviews(db, {
          sessionType: request.query.sessionType,
          limit,
        });
        return reply.send({ ok: true, kind, rows });
      }

      const rows = await listRecent(db, {
        symbol: request.query.symbol?.toUpperCase(),
        limit,
      });
      return reply.send({ ok: true, kind, rows });
    } catch (err) {
      app.log.error({ err, kind }, "Error listing recent artifacts");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}

function buildTelegramNotify(
  config: GatewayConfig,
): ((msg: string) => Promise<void>) | undefined {
  if (!config.telegramBotToken || !config.telegramErrorChatId) return undefined;
  const botToken = config.telegramBotToken;
  const chatId = config.telegramErrorChatId;
  return async (msg: string) => {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
      });
    } catch {
      // Best-effort notification
    }
  };
}
