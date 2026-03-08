import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { GatewayConfig } from "../config.js";
import type { ExtensionRegistry } from "../extension/registry.js";

interface CheckAlertsBody {
  assetType?: "stock" | "crypto";
}

interface TriggeredRow {
  id: string;
  clerk_user_id: string;
  ticker_symbol: string;
  asset_type: string;
  target_price: string;
  platform_user_id: string;
  bar_high: string;
  bar_low: string;
  bar_time: string;
}

export function registerAlertRoutes(
  app: FastifyInstance,
  deps: { config: GatewayConfig; db: Pool; extensions: ExtensionRegistry }
): void {
  const { config, db, extensions } = deps;

  app.post<{ Body: CheckAlertsBody }>(
    "/internal/check-alerts",
    async (request, reply) => {
      const serviceKey = request.headers["x-service-key"] as string | undefined;
      if (!config.internalServiceKey || !serviceKey || serviceKey !== config.internalServiceKey) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const assetType = request.body?.assetType;
      const log = app.log;

      try {
        const triggered = await findTriggeredAlerts(db, assetType);

        if (triggered.length === 0) {
          return reply.send({ ok: true, triggered: 0 });
        }

        log.info({ count: triggered.length }, "Price alerts triggered");

        const telegram = extensions.get("telegram");
        let sent = 0;

        for (const row of triggered) {
          try {
            await db.query(
              "UPDATE user_price_alerts SET status = 'triggered', triggered_at = NOW() WHERE id = $1",
              [row.id]
            );

            const hasSession = await userHasActiveSession(db, row.clerk_user_id);
            if (!hasSession) {
              log.info(
                { alertId: row.id, clerkUserId: row.clerk_user_id },
                "Alert triggered but user has no active session — skipping notification"
              );
              continue;
            }

            if (telegram) {
              const displaySymbol = row.asset_type === "crypto"
                ? row.ticker_symbol.split("/")[0]!
                : row.ticker_symbol;

              const targetPrice = parseFloat(row.target_price).toFixed(2);
              const barHigh = parseFloat(row.bar_high).toFixed(2);
              const barLow = parseFloat(row.bar_low).toFixed(2);
              const barTime = new Date(row.bar_time).toUTCString();

              const text = [
                "**Price Alert Triggered!**",
                "",
                `${displaySymbol} crossed your target of $${targetPrice}`,
                `Latest bar: $${barHigh} high / $${barLow} low`,
                `Time: ${barTime}`,
                "",
                "This alert has been completed and removed from your active alerts.",
              ].join("\n");

              await telegram.sendText({
                platformChatId: row.platform_user_id,
                text,
                parseMode: "Markdown",
              });
              sent++;
            }
          } catch (err) {
            log.error({ err, alertId: row.id }, "Failed to process triggered alert");
          }
        }

        return reply.send({ ok: true, triggered: triggered.length, sent });
      } catch (err) {
        log.error({ err }, "Error checking price alerts");
        return reply.status(500).send({ error: "Internal server error" });
      }
    }
  );
}

async function findTriggeredAlerts(
  db: Pool,
  assetType?: "stock" | "crypto"
): Promise<TriggeredRow[]> {
  const results: TriggeredRow[] = [];

  if (!assetType || assetType === "stock") {
    const stockQuery = `
      SELECT a.id, a.clerk_user_id, a.ticker_symbol, a.asset_type, a.target_price,
             ca.platform_user_id,
             sp.high_price AS bar_high, sp.low_price AS bar_low, sp.price_time AS bar_time
      FROM user_price_alerts a
      JOIN channel_accounts ca
        ON ca.clerk_user_id = a.clerk_user_id AND ca.channel_type = 'telegram'
      JOIN stock_tickers st ON st.symbol = a.ticker_symbol
      JOIN LATERAL (
        SELECT high_price, low_price, price_time
        FROM stock_prices
        WHERE stock_ticker_id = st.id
          AND price_time > NOW() - INTERVAL '45 minutes'
          AND low_price <= a.target_price
          AND high_price >= a.target_price
        ORDER BY price_time DESC
        LIMIT 1
      ) sp ON true
      WHERE a.status = 'active'
        AND a.asset_type IN ('stock', 'etf')`;

    const stockResult = await db.query(stockQuery);
    results.push(...(stockResult.rows as TriggeredRow[]));
  }

  if (!assetType || assetType === "crypto") {
    const cryptoQuery = `
      SELECT a.id, a.clerk_user_id, a.ticker_symbol, a.asset_type, a.target_price,
             ca.platform_user_id,
             cp.high_price AS bar_high, cp.low_price AS bar_low, cp.price_time AS bar_time
      FROM user_price_alerts a
      JOIN channel_accounts ca
        ON ca.clerk_user_id = a.clerk_user_id AND ca.channel_type = 'telegram'
      JOIN crypto_tickers ct ON ct.symbol = a.ticker_symbol
      JOIN LATERAL (
        SELECT high_price, low_price, price_time
        FROM crypto_prices
        WHERE crypto_ticker_id = ct.id
          AND price_time > NOW() - INTERVAL '45 minutes'
          AND low_price <= a.target_price
          AND high_price >= a.target_price
        ORDER BY price_time DESC
        LIMIT 1
      ) cp ON true
      WHERE a.status = 'active'
        AND a.asset_type = 'crypto'`;

    const cryptoResult = await db.query(cryptoQuery);
    results.push(...(cryptoResult.rows as TriggeredRow[]));
  }

  return results;
}

async function userHasActiveSession(db: Pool, clerkUserId: string): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM gateway_sessions WHERE clerk_user_id = $1 AND channel_type = 'telegram' AND expires_at > NOW() LIMIT 1",
    [clerkUserId]
  );
  return result.rows.length > 0;
}
