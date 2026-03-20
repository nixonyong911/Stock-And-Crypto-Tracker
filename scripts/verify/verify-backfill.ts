import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.DATABASE_URL_JS!,
  process.env.DATABASE_SERVICE_ROLE_KEY!
);

let failures = 0;

function check(name: string, passed: boolean, detail?: string) {
  if (passed) {
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

async function main() {
  const symbol = process.argv[2];
  if (!symbol) {
    console.error("Usage: npx tsx verify-backfill.ts <SYMBOL>");
    process.exit(2);
  }

  console.log(`=== Backfill Verification: ${symbol} ===`);

  const { data: stock } = await supabase
    .from("stock_tickers")
    .select("id, symbol")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();

  const { data: crypto } = await supabase
    .from("crypto_tickers")
    .select("id, symbol")
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle();

  const isStock = !!stock;
  const isCrypto = !!crypto;
  const tickerId = stock?.id ?? crypto?.id;
  const kind = isStock ? "stock" : "crypto";

  check("Ticker exists in stock_tickers or crypto_tickers", isStock || isCrypto, kind);
  if (!tickerId) {
    console.log(`\n1 CHECK FAILED`);
    process.exit(1);
  }

  const pricesTable = isStock ? "stock_prices" : "crypto_prices";
  const { count: priceCount } = await supabase
    .from(pricesTable)
    .select("*", { count: "exact", head: true })
    .eq("ticker_id", tickerId);

  check(`Has >= 30 rows in ${pricesTable}`, (priceCount ?? 0) >= 30, `${priceCount} rows`);

  const candleTable = isStock
    ? "analysis_stock_candlestick_pattern"
    : "analysis_crypto_candlestick_pattern";
  const { count: candleCount } = await supabase
    .from(candleTable)
    .select("*", { count: "exact", head: true })
    .eq("ticker_id", tickerId);

  check(`Has rows in ${candleTable}`, (candleCount ?? 0) > 0, `${candleCount} rows`);

  const indicatorTable = isStock
    ? "analysis_indicators_stock_free"
    : "analysis_indicators_crypto_free";
  const { count: indicatorCount } = await supabase
    .from(indicatorTable)
    .select("*", { count: "exact", head: true })
    .eq("ticker_id", tickerId);

  check(`Has rows in ${indicatorTable}`, (indicatorCount ?? 0) > 0, `${indicatorCount} rows`);

  const { count: targetCount } = await supabase
    .from("analysis_ticker_price_targets")
    .select("*", { count: "exact", head: true })
    .eq("ticker_id", tickerId);

  check("Has rows in analysis_ticker_price_targets", (targetCount ?? 0) > 0, `${targetCount} rows`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
