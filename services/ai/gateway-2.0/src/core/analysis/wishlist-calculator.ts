import type { Pool } from "pg";

type SignalDirection = "bullish" | "bearish" | "neutral";

export interface WishlistTickerData {
  symbol: string;
  assetType: string;
  latestClose: number | null;
  entryRange: { low: number; high: number; today: number } | null;
  targetRange: { low: number; high: number } | null;
  stopLossRange: { low: number; high: number } | null;
  weekSignal: SignalDirection;
  weekChangePct: number | null;
  monthSignal: SignalDirection;
  monthChangePct: number | null;
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
const WEEK_LOOKBACK = 5;
const MONTH_LOOKBACK = 20;
const WEEK_BULLISH_PCT = 1;
const WEEK_BEARISH_PCT = -1;
const MONTH_BULLISH_PCT = 3;
const MONTH_BEARISH_PCT = -3;

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

export interface WatchlistRow {
  ticker_symbol: string;
  asset_type: string;
}

export async function getWatchlist(
  db: Pool,
  clerkUserId: string
): Promise<WatchlistRow[]> {
  const result = await db.query<WatchlistRow>(
    `SELECT ticker_symbol, asset_type FROM user_watchlist
     WHERE clerk_user_id = $1
     ORDER BY created_at`,
    [clerkUserId]
  );
  return result.rows;
}

function computeChangePct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function pctToSignal(
  pct: number,
  bullishThreshold: number,
  bearishThreshold: number
): SignalDirection {
  if (pct >= bullishThreshold) return "bullish";
  if (pct <= bearishThreshold) return "bearish";
  return "neutral";
}

function computeTimeframeSignals(rows: PriceTargetRow[]): {
  weekSignal: SignalDirection;
  weekChangePct: number | null;
  monthSignal: SignalDirection;
  monthChangePct: number | null;
} {
  if (rows.length < 2) {
    return { weekSignal: "neutral", weekChangePct: null, monthSignal: "neutral", monthChangePct: null };
  }

  const currentClose = parseFloat(rows[0]!.latest_close);

  const weekIdx = Math.min(WEEK_LOOKBACK, rows.length - 1);
  const weekClose = parseFloat(rows[weekIdx]!.latest_close);
  const weekChangePct = computeChangePct(currentClose, weekClose);
  const weekSignal = pctToSignal(weekChangePct, WEEK_BULLISH_PCT, WEEK_BEARISH_PCT);

  const monthIdx = Math.min(MONTH_LOOKBACK, rows.length - 1);
  const monthClose = parseFloat(rows[monthIdx]!.latest_close);
  const monthChangePct = computeChangePct(currentClose, monthClose);
  const monthSignal = pctToSignal(monthChangePct, MONTH_BULLISH_PCT, MONTH_BEARISH_PCT);

  return {
    weekSignal,
    weekChangePct: Math.round(weekChangePct * 100) / 100,
    monthSignal,
    monthChangePct: Math.round(monthChangePct * 100) / 100,
  };
}

function computeTickerData(
  symbol: string,
  assetType: string,
  rows: PriceTargetRow[]
): WishlistTickerData {
  if (rows.length === 0) {
    return {
      symbol,
      assetType,
      latestClose: null,
      entryRange: null,
      targetRange: null,
      stopLossRange: null,
      weekSignal: "neutral",
      weekChangePct: null,
      monthSignal: "neutral",
      monthChangePct: null,
      isEntryZone: false,
      analysisDate: null,
      dataPoints: 0,
    };
  }

  const latest = rows[0]!;
  const latestClose = parseFloat(latest.latest_close);
  const todayEntry = latest.entry_price ? parseFloat(latest.entry_price) : null;
  const todayTarget = latest.target_price ? parseFloat(latest.target_price) : null;
  const todayStopLoss = latest.stop_loss ? parseFloat(latest.stop_loss) : null;
  const signals = computeTimeframeSignals(rows);

  if (rows.length < MIN_DATA_POINTS) {
    return {
      symbol,
      assetType,
      latestClose,
      entryRange: todayEntry != null ? { low: todayEntry, high: todayEntry, today: todayEntry } : null,
      targetRange: todayTarget != null ? { low: todayTarget, high: todayTarget } : null,
      stopLossRange: todayStopLoss != null ? { low: todayStopLoss, high: todayStopLoss } : null,
      ...signals,
      isEntryZone: todayEntry != null && latestClose <= todayEntry,
      analysisDate: latest.analysis_date,
      dataPoints: rows.length,
    };
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

  const isEntryZone =
    entryRange != null && latestClose >= entryRange.low && latestClose <= entryRange.high;

  return {
    symbol,
    assetType,
    latestClose,
    entryRange,
    targetRange,
    stopLossRange,
    ...signals,
    isEntryZone,
    analysisDate: latest.analysis_date,
    dataPoints: rows.length,
  };
}

export async function calculateTickersData(
  db: Pool,
  watchlistRows: WatchlistRow[]
): Promise<Map<string, WishlistTickerData>> {
  const result = new Map<string, WishlistTickerData>();
  if (watchlistRows.length === 0) return result;

  const symbols = watchlistRows.map((r) => r.ticker_symbol);

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

  for (const wl of watchlistRows) {
    const rows = (grouped.get(wl.ticker_symbol) ?? []).slice(0, LOOKBACK_DAYS);
    result.set(wl.ticker_symbol, computeTickerData(wl.ticker_symbol, wl.asset_type, rows));
  }

  return result;
}

export async function calculateWishlist(
  db: Pool,
  clerkUserId: string
): Promise<WishlistResult> {
  const allRows = await getWatchlist(db, clerkUserId);

  if (allRows.length === 0) {
    return { tickers: [], totalWatchlistCount: 0, asOfDate: null };
  }

  const tickerMap = await calculateTickersData(db, allRows);

  let latestDate: string | null = null;
  const tickers: WishlistTickerData[] = [];

  for (const wl of allRows) {
    const data = tickerMap.get(wl.ticker_symbol);
    if (!data) continue;
    tickers.push(data);
    if (data.analysisDate && (!latestDate || data.analysisDate > latestDate)) {
      latestDate = data.analysisDate;
    }
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
