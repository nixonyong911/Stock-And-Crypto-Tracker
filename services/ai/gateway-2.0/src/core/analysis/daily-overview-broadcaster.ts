import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import {
  buildMarketSnapshot,
  synthesizeOverview,
  formatMorningBrief,
  formatEveningRecap,
} from "./market-overview.js";

const SEND_DELAY_MS = 50;

export interface BroadcastDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
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

  const synthesis = await synthesizeOverview(snapshot, redis, log);

  const message = sessionType === "pre_market"
    ? formatMorningBrief(snapshot, synthesis)
    : formatEveningRecap(snapshot, synthesis);

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
