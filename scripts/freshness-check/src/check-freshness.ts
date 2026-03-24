import { TABLE_CHECKS } from "./table-config.js";
import { checkTradingDay, type AlpacaCredentials } from "./market-calendar.js";
import { evaluateAll } from "./freshness-checker.js";
import { formatMessage } from "./message-formatter.js";
import { fetchMaxTimestamp, closePool } from "./db.js";
import { sendTelegram } from "./telegram.js";

async function main(): Promise<void> {
  const now = new Date();
  console.log(`[${now.toISOString()}] Starting freshness check...`);

  const creds: AlpacaCredentials | undefined =
    process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY
      ? {
          apiKeyId: process.env.ALPACA_API_KEY_ID,
          apiSecretKey: process.env.ALPACA_API_SECRET_KEY,
        }
      : undefined;

  const market = await checkTradingDay(now, creds);
  console.log(
    `Market: ${market.isTradingDay ? "Open" : "Closed"} (${market.reason ?? "trading day"}) [${market.source}]`,
  );

  const results = await evaluateAll(TABLE_CHECKS, fetchMaxTimestamp, now, market);

  for (const r of results) {
    const icon = r.status === "ok" ? "OK" : r.status === "stale" ? "STALE" : "SKIP";
    const detail = r.ageHours !== null ? `${r.ageHours}h ago` : r.skipReason ?? r.latestTimestamp ?? "";
    console.log(`  [${icon}] ${r.label} — ${detail}`);
  }

  const message = formatMessage(results, market, now);
  console.log("\nTelegram message:\n" + message);

  await sendTelegram(message);
  await closePool();

  const staleCount = results.filter((r) => r.status === "stale").length;
  console.log(`\nDone. ${staleCount} stale table(s).`);
  process.exit(staleCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
