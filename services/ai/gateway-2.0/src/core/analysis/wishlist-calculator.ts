import type { Pool } from "pg";

export interface WishlistTickerData {
  symbol: string;
  assetType: string;
  latestClose: number | null;
  entryRange: { low: number; high: number; today: number } | null;
  targetRange: { low: number; high: number } | null;
  stopLossRange: { low: number; high: number } | null;
  signal: string;
  isEntryZone: boolean;
  analysisDate: string | null;
  dataPoints: number;
}

export interface WishlistResult {
  tickers: WishlistTickerData[];
  totalWatchlistCount: number;
  asOfDate: string | null;
}

const MIN_DATA_POINTS = 5;
const LOOKBACK_DAYS = 20;

interface PriceTargetRow {
  ticker_symbol: string;
  asset_type: string;
  analysis_date: string;
  latest_close: string;
  entry_price: string | null;
  target_price: string | null;
  stop_loss: string | null;
  signal_summary: string | null;
}

interface WatchlistRow {
  ticker_symbol: string;
  asset_type: string;
}

export async function calculateWishlist(
  db: Pool,
  clerkUserId: string
): Promise<WishlistResult> {
  const watchlistResult = await db.query<WatchlistRow>(
    `SELECT ticker_symbol, asset_type FROM user_watchlist
     WHERE clerk_user_id = $1
     ORDER BY created_at`,
    [clerkUserId]
  );

  const allRows = watchlistResult.rows;
  const stockEtfRows = allRows.filter(
    (r) => r.asset_type === "stock" || r.asset_type === "etf"
  );

  if (stockEtfRows.length === 0) {
    return { tickers: [], totalWatchlistCount: allRows.length, asOfDate: null };
  }

  const symbols = stockEtfRows.map((r) => r.ticker_symbol);

  const targetsResult = await db.query<PriceTargetRow>(
    `SELECT ticker_symbol, asset_type, analysis_date::text,
            latest_close::text, entry_price::text, target_price::text,
            stop_loss::text, signal_summary
     FROM analysis_ticker_price_targets
     WHERE ticker_symbol = ANY($1)
       AND analysis_date >= CURRENT_DATE - INTERVAL '30 days'
     ORDER BY ticker_symbol, analysis_date DESC`,
    [symbols]
  );

  const grouped = new Map<string, PriceTargetRow[]>();
  for (const row of targetsResult.rows) {
    const existing = grouped.get(row.ticker_symbol) ?? [];
    existing.push(row);
    grouped.set(row.ticker_symbol, existing);
  }

  let latestDate: string | null = null;
  const tickers: WishlistTickerData[] = [];

  for (const wl of stockEtfRows) {
    const rows = (grouped.get(wl.ticker_symbol) ?? []).slice(0, LOOKBACK_DAYS);

    if (rows.length === 0) {
      tickers.push({
        symbol: wl.ticker_symbol,
        assetType: wl.asset_type,
        latestClose: null,
        entryRange: null,
        targetRange: null,
        stopLossRange: null,
        signal: "neutral",
        isEntryZone: false,
        analysisDate: null,
        dataPoints: 0,
      });
      continue;
    }

    const latest = rows[0]!;
    if (!latestDate || latest.analysis_date > latestDate) {
      latestDate = latest.analysis_date;
    }

    const latestClose = parseFloat(latest.latest_close);
    const todayEntry = latest.entry_price ? parseFloat(latest.entry_price) : null;
    const todayTarget = latest.target_price ? parseFloat(latest.target_price) : null;
    const todayStopLoss = latest.stop_loss ? parseFloat(latest.stop_loss) : null;

    if (rows.length < MIN_DATA_POINTS) {
      tickers.push({
        symbol: wl.ticker_symbol,
        assetType: wl.asset_type,
        latestClose,
        entryRange: todayEntry != null ? { low: todayEntry, high: todayEntry, today: todayEntry } : null,
        targetRange: todayTarget != null ? { low: todayTarget, high: todayTarget } : null,
        stopLossRange: todayStopLoss != null ? { low: todayStopLoss, high: todayStopLoss } : null,
        signal: latest.signal_summary ?? "neutral",
        isEntryZone: todayEntry != null && latestClose <= todayEntry,
        analysisDate: latest.analysis_date,
        dataPoints: rows.length,
      });
      continue;
    }

    const entryPrices = rows.map((r) => r.entry_price).filter(Boolean).map(Number);
    const targetPrices = rows.map((r) => r.target_price).filter(Boolean).map(Number);
    const stopLossPrices = rows.map((r) => r.stop_loss).filter(Boolean).map(Number);

    const entryRange = entryPrices.length > 0
      ? { low: Math.min(...entryPrices), high: Math.max(...entryPrices), today: todayEntry ?? entryPrices[0]! }
      : null;

    const targetRange = targetPrices.length > 0
      ? { low: Math.min(...targetPrices), high: Math.max(...targetPrices) }
      : null;

    const stopLossRange = stopLossPrices.length > 0
      ? { low: Math.min(...stopLossPrices), high: Math.max(...stopLossPrices) }
      : null;

    const signals = rows.map((r) => r.signal_summary ?? "neutral");
    const bullish = signals.filter((s) => s === "bullish").length;
    const bearish = signals.filter((s) => s === "bearish").length;
    const signal = bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral";

    const isEntryZone =
      entryRange != null && latestClose >= entryRange.low && latestClose <= entryRange.high;

    tickers.push({
      symbol: wl.ticker_symbol,
      assetType: wl.asset_type,
      latestClose,
      entryRange,
      targetRange,
      stopLossRange,
      signal,
      isEntryZone,
      analysisDate: latest.analysis_date,
      dataPoints: rows.length,
    });
  }

  return {
    tickers,
    totalWatchlistCount: allRows.length,
    asOfDate: latestDate,
  };
}

export function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}
