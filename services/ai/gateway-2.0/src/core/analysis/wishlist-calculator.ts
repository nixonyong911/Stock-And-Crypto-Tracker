import type { Pool } from "pg";

export interface WishlistTickerData {
  symbol: string;
  assetType: string;
  latestClose: number | null;
  entryRange: { low: number; high: number; today: number } | null;
  targetRange: { low: number; high: number } | null;
  stopLossRange: { low: number; high: number } | null;
  signal: string;
  trend: "up" | "down" | "flat";
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

const DECAY_FACTOR = 0.9;
const SIGNAL_WEIGHT = 0.6;
const TREND_WEIGHT = 0.4;
const BULLISH_THRESHOLD = 0.15;
const BEARISH_THRESHOLD = -0.15;
const TREND_CHANGE_THRESHOLD = 0.02;

function computeWeightedSignal(rows: PriceTargetRow[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < rows.length; i++) {
    const weight = Math.pow(DECAY_FACTOR, i);
    const sig = rows[i]!.signal_summary ?? "neutral";
    const score = sig === "bullish" ? 1 : sig === "bearish" ? -1 : 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function computePriceTrend(rows: PriceTargetRow[]): { score: number; direction: "up" | "down" | "flat" } {
  const closes = rows.map((r) => parseFloat(r.latest_close));
  if (closes.length < 4) return { score: 0, direction: "flat" };

  const mid = Math.floor(closes.length / 2);
  const recentHalf = closes.slice(0, mid);
  const olderHalf = closes.slice(mid);

  const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
  const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;

  if (olderAvg === 0) return { score: 0, direction: "flat" };
  const change = (recentAvg - olderAvg) / olderAvg;

  let direction: "up" | "down" | "flat" = "flat";
  if (change > TREND_CHANGE_THRESHOLD) direction = "up";
  else if (change < -TREND_CHANGE_THRESHOLD) direction = "down";

  const score = Math.max(-1, Math.min(1, change * 10));
  return { score, direction };
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
      signal: "neutral",
      trend: "flat",
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

  if (rows.length < MIN_DATA_POINTS) {
    const { direction } = computePriceTrend(rows);
    return {
      symbol,
      assetType,
      latestClose,
      entryRange: todayEntry != null ? { low: todayEntry, high: todayEntry, today: todayEntry } : null,
      targetRange: todayTarget != null ? { low: todayTarget, high: todayTarget } : null,
      stopLossRange: todayStopLoss != null ? { low: todayStopLoss, high: todayStopLoss } : null,
      signal: latest.signal_summary ?? "neutral",
      trend: direction,
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

  const weightedSignal = computeWeightedSignal(rows);
  const { score: trendScore, direction: trend } = computePriceTrend(rows);
  const composite = (weightedSignal * SIGNAL_WEIGHT) + (trendScore * TREND_WEIGHT);
  const signal = composite > BULLISH_THRESHOLD ? "bullish" : composite < BEARISH_THRESHOLD ? "bearish" : "neutral";

  const isEntryZone =
    entryRange != null && latestClose >= entryRange.low && latestClose <= entryRange.high;

  return {
    symbol,
    assetType,
    latestClose,
    entryRange,
    targetRange,
    stopLossRange,
    signal,
    trend,
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
  const stockEtfRows = allRows.filter(
    (r) => r.asset_type === "stock" || r.asset_type === "etf"
  );

  if (stockEtfRows.length === 0) {
    return { tickers: [], totalWatchlistCount: allRows.length, asOfDate: null };
  }

  const tickerMap = await calculateTickersData(db, stockEtfRows);

  let latestDate: string | null = null;
  const tickers: WishlistTickerData[] = [];

  for (const wl of stockEtfRows) {
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
