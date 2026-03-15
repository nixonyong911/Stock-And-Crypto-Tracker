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

function isMarketHours(date: Date): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  const etHour = (date.getUTCHours() - 4 + 24) % 24;
  const etMin = date.getUTCMinutes();
  const etTime = etHour * 60 + etMin;
  return etTime >= 9 * 60 + 30 && etTime <= 16 * 60;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

async function verifyStockPrices() {
  console.log("\n── Stock Prices ──");

  const { data: ticker } = await supabase
    .from("stock_tickers")
    .select("id, symbol")
    .eq("is_active", true)
    .order("symbol")
    .limit(1)
    .single();

  check("Active stock ticker exists", !!ticker, ticker?.symbol);
  if (!ticker) return;

  const { data: prices } = await supabase
    .from("stock_prices")
    .select("price_time")
    .eq("ticker_id", ticker.id)
    .order("price_time", { ascending: false })
    .limit(10);

  check("Has recent stock prices", !!prices && prices.length >= 2, `${prices?.length ?? 0} rows`);
  if (!prices || prices.length < 2) return;

  const times = prices.map((p) => new Date(p.price_time));
  let intervalsOk = 0;
  let intervalsChecked = 0;

  for (let i = 0; i < times.length - 1; i++) {
    const older = times[i + 1];
    if (!isMarketHours(older)) continue;
    const gap = minutesBetween(times[i], older);
    intervalsChecked++;
    if (gap >= 25 && gap <= 35) intervalsOk++;
  }

  if (intervalsChecked > 0) {
    check(
      "Stock price intervals ~30 min (market hours)",
      intervalsOk / intervalsChecked >= 0.7,
      `${intervalsOk}/${intervalsChecked} within 25-35 min`
    );
  } else {
    check("Stock price intervals (no market-hour data to check)", true, "skipped — outside market hours");
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const { count: indicatorCount } = await supabase
    .from("analysis_stock_indicator")
    .select("*", { count: "exact", head: true })
    .eq("ticker_id", ticker.id)
    .gte("created_at", twoHoursAgo);

  const now = new Date();
  if (isMarketHours(now)) {
    check("Stock indicators within last 2 h (market hours)", (indicatorCount ?? 0) > 0, `${indicatorCount} rows`);
  } else {
    check("Stock indicators (outside market hours)", true, "skipped");
  }
}

async function verifyCryptoPrices() {
  console.log("\n── Crypto Prices ──");

  const { data: ticker } = await supabase
    .from("crypto_tickers")
    .select("id, symbol")
    .eq("is_active", true)
    .order("symbol")
    .limit(1)
    .single();

  check("Active crypto ticker exists", !!ticker, ticker?.symbol);
  if (!ticker) return;

  const { data: prices } = await supabase
    .from("crypto_prices")
    .select("price_time")
    .eq("ticker_id", ticker.id)
    .order("price_time", { ascending: false })
    .limit(10);

  check("Has recent crypto prices", !!prices && prices.length >= 2, `${prices?.length ?? 0} rows`);
  if (!prices || prices.length < 2) return;

  const times = prices.map((p) => new Date(p.price_time));
  let intervalsOk = 0;

  for (let i = 0; i < times.length - 1; i++) {
    const gap = minutesBetween(times[i], times[i + 1]);
    if (gap >= 25 && gap <= 35) intervalsOk++;
  }

  const total = times.length - 1;
  check(
    "Crypto price intervals ~30 min (24/7)",
    intervalsOk / total >= 0.7,
    `${intervalsOk}/${total} within 25-35 min`
  );

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const { count: indicatorCount } = await supabase
    .from("analysis_crypto_indicator")
    .select("*", { count: "exact", head: true })
    .eq("ticker_id", ticker.id)
    .gte("created_at", twoHoursAgo);

  check("Crypto indicators within last 2 h", (indicatorCount ?? 0) > 0, `${indicatorCount} rows`);
}

async function verifyWorkerSchedules() {
  console.log("\n── Worker Fetch Schedules ──");

  const { data: schedules } = await supabase
    .from("worker_fetch_schedules")
    .select("schedule_name, is_enabled, last_run_status, last_run_at")
    .eq("is_enabled", true);

  check("Enabled schedules exist", !!schedules && schedules.length > 0, `${schedules?.length ?? 0} enabled`);
  if (!schedules) return;

  for (const s of schedules) {
    check(
      `Schedule "${s.schedule_name}" last run success`,
      s.last_run_status === "success",
      `status=${s.last_run_status}, ran=${s.last_run_at}`
    );
  }
}

async function main() {
  console.log("=== Price Fetching Verification ===");
  await verifyStockPrices();
  await verifyCryptoPrices();
  await verifyWorkerSchedules();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
