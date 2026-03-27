import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { GatewayConfig } from "../config.js";
import type { ExtensionRegistry } from "../extension/registry.js";
import { detectSignals, type TickerSignal, type MacroContext } from "../core/analysis/recommendation-engine.js";
import { broadcastDailyOverview } from "../core/analysis/daily-overview-broadcaster.js";
import { generateExplanation } from "../core/analysis/explanation-generator.js";
import { formatRecommendation } from "../core/analysis/digest-formatter.js";
import { secondsUntilMidnightUTC } from "../core/analysis/wishlist-calculator.js";
import { processUnfilteredNews } from "../core/analysis/news-processor.js";

interface CheckRecommendationsBody {
  assetType?: "stock" | "crypto";
}

const MAX_DAILY_SENDS = 6;

// ---------------------------------------------------------------------------
// Shared logic: signal detection → dedup → fan-out
// ---------------------------------------------------------------------------

export interface ProcessRecommendationsDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
}

export async function processRecommendations(
  deps: ProcessRecommendationsDeps,
  assetType?: "stock" | "crypto",
): Promise<{ signals: number; sent: number }> {
  const { db, redis, extensions, log } = deps;
  const types: Array<"stock" | "crypto"> =
    assetType ? [assetType] : ["stock", "crypto"];

  let totalSignals = 0;
  let totalSent = 0;

  for (const type of types) {
    const { signals, macroContext } = await detectSignals(db, type);
    if (signals.length === 0) continue;

    log.info(
      { assetType: type, signalCount: signals.length },
      "Signals detected",
    );

    const newSignals = await filterDedupSignals(redis, signals);
    if (newSignals.length === 0) continue;

    totalSignals += newSignals.length;

    const bySymbol = new Map<string, TickerSignal[]>();
    for (const s of newSignals) {
      let arr = bySymbol.get(s.symbol);
      if (!arr) {
        arr = [];
        bySymbol.set(s.symbol, arr);
      }
      arr.push(s);
    }

    for (const [symbol, tickerSignals] of bySymbol) {
      const sent = await fanOutToWatchers(
        db,
        redis,
        log,
        extensions,
        symbol,
        tickerSignals,
        macroContext,
      );
      totalSent += sent;
    }
  }

  return { signals: totalSignals, sent: totalSent };
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
          telegramNotify,
        });
        return reply.send({ ok: true, ...result });
      } catch (err) {
        app.log.error({ err }, "Error processing unfiltered news");
        return reply.status(500).send({ error: "Internal server error" });
      }
    },
  );
}

async function filterDedupSignals(
  redis: Redis,
  signals: TickerSignal[],
): Promise<TickerSignal[]> {
  const ttl = secondsUntilMidnightUTC();
  const result: TickerSignal[] = [];

  for (const s of signals) {
    const key = `digest:signal:${s.symbol}:${s.type}`;
    const exists = await redis.exists(key);
    if (exists) continue;

    await redis.set(key, JSON.stringify({ direction: s.rawData.swingSignal }), "EX", ttl);
    result.push(s);
  }

  return result;
}

async function fanOutToWatchers(
  db: Pool,
  redis: Redis,
  log: FastifyInstance["log"],
  extensions: ExtensionRegistry,
  symbol: string,
  signals: TickerSignal[],
  macroContext: MacroContext,
): Promise<number> {
  const watchers = await db.query<{
    clerk_user_id: string;
    platform_user_id: string;
  }>(
    `SELECT DISTINCT ON (uw.clerk_user_id) uw.clerk_user_id, ca.platform_user_id
     FROM user_watchlist uw
     JOIN channel_accounts ca
       ON ca.clerk_user_id = uw.clerk_user_id AND ca.channel_type = 'telegram'
     JOIN gateway_sessions gs
       ON gs.clerk_user_id = uw.clerk_user_id AND gs.channel_type = 'telegram' AND gs.expires_at > NOW()
     WHERE uw.ticker_symbol = $1`,
    [symbol],
  );

  if (watchers.rows.length === 0) return 0;

  const telegram = extensions.get("telegram");
  if (!telegram) return 0;

  const explanation = await generateExplanation(signals, log, redis, macroContext);
  const primary = signals[0]!;
  const message = formatRecommendation(
    primary.symbol,
    primary.headline,
    explanation,
  );

  let sent = 0;
  const ttl = secondsUntilMidnightUTC();

  for (const watcher of watchers.rows) {
    try {
      const capKey = `digest:count:${watcher.clerk_user_id}`;
      const currentCount = await redis.get(capKey);
      if (currentCount != null && parseInt(currentCount, 10) >= MAX_DAILY_SENDS) {
        continue;
      }

      const prefResult = await db.query<{ is_enabled: boolean }>(
        "SELECT is_enabled FROM user_digest_preferences WHERE clerk_user_id = $1",
        [watcher.clerk_user_id],
      );
      if (prefResult.rows[0]?.is_enabled === false) continue;

      await telegram.sendText({
        platformChatId: watcher.platform_user_id,
        text: message,
        parseMode: "Markdown",
      });

      await redis.incr(capKey);
      const ttlExists = await redis.ttl(capKey);
      if (ttlExists < 0) await redis.expire(capKey, ttl);

      await db
        .query(
          `INSERT INTO user_recommendation_log
           (clerk_user_id, ticker_symbol, recommendation_type, priority, headline, message_body, timeframe_alignment)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            watcher.clerk_user_id,
            primary.symbol,
            primary.type,
            primary.priority,
            primary.headline,
            message,
            primary.timeframeAlignment,
          ],
        )
        .catch((err) => log.error({ err }, "Failed to log recommendation"));

      sent++;
    } catch (err) {
      log.error(
        { err, clerkUserId: watcher.clerk_user_id, symbol },
        "Failed to send recommendation",
      );
    }
  }

  return sent;
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
