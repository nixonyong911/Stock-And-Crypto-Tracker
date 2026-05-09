import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { GatewayConfig } from "../config.js";
import type { ExtensionRegistry } from "../extension/registry.js";
import { detectSignalsForTicker } from "../core/analysis/recommendation-engine.js";
import { broadcastDailyOverview } from "../core/analysis/daily-overview-broadcaster.js";
import { generateDigestBrief } from "../core/analysis/digest-brief-generator.js";
import { processUnfilteredNews } from "../core/analysis/news-processor.js";
import { curateMarketMemory } from "../core/analysis/memory-curator.js";
import { processRecommendations } from "../core/analysis/digest-pipeline.js";
import { canReceiveSmartDigest } from "../core/analysis/digest-eligibility.js";
import {
  renderSmartDigestCard,
  deliverSmartDigest,
} from "../core/analysis/digest-delivery.js";

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
          { db, redis, extensions, log: app.log },
          request.body?.assetType,
        );
        return reply.send({ ok: true, ...result });
      } catch (err) {
        app.log.error({ err }, "Error checking recommendations");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );

  app.post<{ Body: { sessionType?: "pre_market" | "post_close" } }>(
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

      try {
        const sessionType = request.body?.sessionType ?? "post_close";
        const result = await broadcastDailyOverview(
          { db, redis, extensions, log: app.log },
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

        const { signals, macroContext, newsOneLinerMap } =
          await detectSignalsForTicker(db, symbol, assetType);

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
        });
        const rendered = await renderSmartDigestCard(brief, app.log);
        const primary = signals[0]!;
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
