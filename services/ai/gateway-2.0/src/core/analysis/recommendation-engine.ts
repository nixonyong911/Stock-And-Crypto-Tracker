import type { Pool } from "pg";
import { getMemoryFreshnessHours } from "./digest-brief-truth.js";
import {
  computeSymbolAffinity,
  getAffinityMin,
  getIncludeInferredOnly,
  textMentionsAnyAlias,
  type AffinityResult,
} from "./digest-symbol-affinity.js";
import { coercePrimaryTickerSource } from "./primary-ticker.js";

/**
 * Per-ticker text loaded from `analysis_market_memory` for a single
 * symbol. Owned by the engine because this is a DB-backed shape; consumed
 * by `digest-brief-truth.ts` where it is treated as truth input.
 */
export interface TickerMemoryText {
  newsOneLiner?: string;
  summary?: string;
  keyFacts?: string[];
  marketImplications?: string;
  impactLevel?: "critical" | "high" | "medium" | "low";
  relevanceScore?: number;
  sentimentScore?: number;
  lastUpdated?: string;
}

export interface TickerSignal {
  symbol: string;
  assetType: "stock" | "crypto";
  type:
    | "entry_zone"
    | "target_reached"
    | "stop_loss_warning"
    | "signal_change"
    | "momentum_shift"
    | "notable_pattern"
    | "news_sentiment";
  priority: "high" | "medium" | "low";
  timeframeAlignment: "full" | "partial" | "conflict";
  headline: string;
  rawData: {
    close: number;
    latestOpen?: number;
    daySignal: string;
    swingSignal: string;
    longTermSignal: string;
    entryLow?: number;
    entryHigh?: number;
    targetPrice?: number;
    stopLoss?: number;
    rsi?: number;
    ema20?: number;
    ema50?: number;
    periodLow?: number;
    periodHigh?: number;
    lookbackDays?: number;
    confidence?: number;
    patterns?: Array<{ pattern: string; confidence: number; signal: string }>;
    previousSignal?: string;
    currentSignal?: string;
    macdHistogram?: number;
    previousMacdHistogram?: number;
    newsArticleCount?: number;
    newsAvgSentiment?: number;
    newsSentimentLabel?: string;
    newsHeadlines?: string[];
  };
}

// ── Internal row types ──────────────────────────────────────────────────

export interface PriceTargetRow {
  ticker_symbol: string;
  asset_type: string;
  trader_type: string;
  analysis_date: string;
  latest_close: string;
  latest_open: string | null;
  entry_price_low: string | null;
  entry_price_high: string | null;
  target_price: string | null;
  stop_loss: string | null;
  signal_summary: string | null;
  confidence: string | null;
  metadata: PriceTargetMeta | null;
}

interface PriceTargetMeta {
  rsi?: number;
  ema_20?: number;
  ema_50?: number;
  low_period?: number;
  high_period?: number;
  lookback_days?: number;
}

export interface IndicatorRow {
  ticker_symbol: string;
  analysis_date: string;
  macd_histogram: string | null;
}

export interface CandlestickRow {
  ticker_symbol: string;
  detected_patterns: Array<{
    pattern: string;
    confidence: number;
    signal: string;
  }>;
}

/**
 * Wall Street analyst recommendation mix for a single stock, derived from
 * Finnhub recommendation trends stored in `analysis_indicators_stock_pro`.
 * Percentages are integers that always sum to 100 (largest-remainder
 * rounding). `null` consensus / zero total rows are filtered out upstream.
 */
export interface AnalystMix {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  /** Total covering firms = sum of all five buckets. */
  total: number;
  /** (strongBuy + buy) / total, rounded so buy+hold+sell = 100. */
  buyPct: number;
  /** hold / total. */
  holdPct: number;
  /** (sell + strongSell) / total. */
  sellPct: number;
  /** Derived label: strong_buy | buy | hold | sell | strong_sell. */
  consensus: string | null;
}

interface AnalystMixRow {
  ticker_symbol: string;
  analyst_strong_buy: number | null;
  analyst_buy: number | null;
  analyst_hold: number | null;
  analyst_sell: number | null;
  analyst_strong_sell: number | null;
  analyst_consensus: string | null;
}

type SignalDir = "bullish" | "bearish" | "neutral";

// ── Helpers ─────────────────────────────────────────────────────────────

function toNum(val: string | null | undefined): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function toSig(val: string | null | undefined): SignalDir {
  if (val === "bullish" || val === "bearish") return val;
  return "neutral";
}

export function computeAlignment(
  day: SignalDir,
  swing: SignalDir,
  longTerm: SignalDir,
): "full" | "partial" | "conflict" {
  if (day === swing && swing === longTerm) return "full";
  if (day === swing || swing === longTerm || day === longTerm) return "partial";
  return "conflict";
}

function fmtPrice(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

/**
 * Round three percentages (that sum to ~100 before rounding) to integers
 * that sum to exactly 100, using the largest-remainder method. Input order
 * is [buy, hold, sell]; output preserves that order.
 */
function roundPctTo100(
  buy: number,
  hold: number,
  sell: number,
): [number, number, number] {
  const raw = [buy, hold, sell];
  const result = raw.map((v) => Math.floor(v));
  const remainder = 100 - result.reduce((a, b) => a + b, 0);
  if (remainder > 0) {
    const order = raw
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder; k++) {
      const idx = order[k % order.length]!.i;
      result[idx] = (result[idx] ?? 0) + 1;
    }
  }
  return [result[0] ?? 0, result[1] ?? 0, result[2] ?? 0];
}

/**
 * Build an `AnalystMix` from raw Finnhub recommendation counts. Returns
 * `null` when there is no coverage (total === 0) so callers can omit the
 * section rather than render an empty bar. Pure / no I/O.
 */
export function computeAnalystMix(
  strongBuy: number,
  buy: number,
  hold: number,
  sell: number,
  strongSell: number,
  consensus: string | null,
): AnalystMix | null {
  const sb = Math.max(0, Math.trunc(Number(strongBuy) || 0));
  const b = Math.max(0, Math.trunc(Number(buy) || 0));
  const h = Math.max(0, Math.trunc(Number(hold) || 0));
  const s = Math.max(0, Math.trunc(Number(sell) || 0));
  const ss = Math.max(0, Math.trunc(Number(strongSell) || 0));
  const total = sb + b + h + s + ss;
  if (total <= 0) return null;

  const [buyPct, holdPct, sellPct] = roundPctTo100(
    ((sb + b) / total) * 100,
    (h / total) * 100,
    ((s + ss) / total) * 100,
  );

  return {
    strongBuy: sb,
    buy: b,
    hold: h,
    sell: s,
    strongSell: ss,
    total,
    buyPct,
    holdPct,
    sellPct,
    consensus: consensus ?? null,
  };
}

/** ETF / index proxies when memory lists SPY/QQQ but digest symbol is platform index (eToro). */
const NEWS_ONE_LINER_INDEX_ALIASES: Record<string, string[]> = {
  SPX500: ["SPY"],
  NSDQ100: ["QQQ"],
  DJ30: ["DIA"],
  RTY: ["IWM"],
};

/** Base asset for crypto pair symbols stored as BASE/USD in price targets. */
export function cryptoPairBase(symbol: string): string | null {
  const u = symbol.toUpperCase();
  const i = u.indexOf("/");
  if (i <= 0) return null;
  const base = u.slice(0, i).trim();
  return base.length > 0 ? base : null;
}

/** Symbols to match against `analysis_market_memory.affected_tickers` for one digest symbol. */
export function newsLookupCandidateSymbols(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  const out = new Set<string>([upper]);
  const base = cryptoPairBase(upper);
  if (base) {
    out.add(base);
    out.add(`${base}/USD`);
  }
  for (const [platform, alts] of Object.entries(NEWS_ONE_LINER_INDEX_ALIASES)) {
    if (platform === upper) {
      for (const a of alts) out.add(a.toUpperCase());
    }
  }
  return [...out];
}

/** Resolve `news_one_liner` when memory keys differ from digest symbol (e.g. BTC vs BTC/USD, SPY vs SPX500). */
export function resolveNewsOneLiner(
  symbol: string,
  map: Map<string, string>,
): string | undefined {
  const upper = symbol.toUpperCase();
  let v = map.get(upper);
  if (v) return v;
  const base = cryptoPairBase(upper);
  if (base) {
    v = map.get(base);
    if (v) return v;
    v = map.get(`${base}/USD`);
    if (v) return v;
  }
  for (const alt of NEWS_ONE_LINER_INDEX_ALIASES[upper] ?? []) {
    v = map.get(alt.toUpperCase());
    if (v) return v;
  }
  return undefined;
}

function mergeHeadlineAndOneLinerMapsForDigestSymbol(
  digestSymbol: string,
  headlineMap: Map<string, string[]>,
  oneLinerMap: Map<string, string>,
): void {
  const primary = digestSymbol.toUpperCase();
  const candidates = newsLookupCandidateSymbols(digestSymbol);
  const mergedHeadlines: string[] = [];
  for (const c of candidates) {
    mergedHeadlines.push(...(headlineMap.get(c) ?? []));
  }
  const uniq = [...new Set(mergedHeadlines)].slice(0, 10);
  if (uniq.length > 0) headlineMap.set(primary, uniq);
  const one = resolveNewsOneLiner(digestSymbol, oneLinerMap);
  if (one) oneLinerMap.set(primary, one);
}

function groupBy<T extends { ticker_symbol: string }>(
  rows: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    let arr = m.get(r.ticker_symbol);
    if (!arr) {
      arr = [];
      m.set(r.ticker_symbol, arr);
    }
    arr.push(r);
  }
  return m;
}

// ── Data fetching ───────────────────────────────────────────────────────

async function fetchPriceTargets(
  db: Pool,
  assetType: "stock" | "crypto",
  symbolFilter?: string,
): Promise<PriceTargetRow[]> {
  const params: unknown[] = [assetType];
  let symbolClause = "";
  if (symbolFilter) {
    symbolClause = " AND ticker_symbol = $2";
    params.push(symbolFilter);
  }

  const { rows } = await db.query<PriceTargetRow>(
    `SELECT ticker_symbol, asset_type, trader_type, analysis_date::text,
            latest_close::text, latest_open::text,
            entry_price_low::text, entry_price_high::text,
            target_price::text, stop_loss::text,
            signal_summary, confidence::text, metadata
     FROM analysis_ticker_price_targets
     WHERE asset_type = $1
       AND analysis_date >= CURRENT_DATE - INTERVAL '1 day'${symbolClause}
     ORDER BY ticker_symbol, trader_type, analysis_date DESC`,
    params,
  );
  return rows;
}

async function fetchIndicators(
  db: Pool,
  assetType: "stock" | "crypto",
  symbolFilter?: string,
): Promise<IndicatorRow[]> {
  const isStock = assetType === "stock";
  const table = isStock ? "analysis_indicators_stock_free" : "analysis_indicators_crypto_free";
  const tickerTable = isStock ? "stock_tickers" : "crypto_tickers";
  const fk = isStock ? "stock_ticker_id" : "crypto_ticker_id";

  const params: unknown[] = [];
  let symbolClause = "";
  if (symbolFilter) {
    symbolClause = " AND UPPER(t.symbol) = UPPER($1)";
    params.push(symbolFilter);
  }

  const { rows } = await db.query<IndicatorRow>(
    `WITH daily AS (
       SELECT DISTINCT ON (t.symbol, (i.indicator_time AT TIME ZONE 'America/New_York')::date)
              t.symbol AS ticker_symbol,
              (i.indicator_time AT TIME ZONE 'America/New_York')::date::text AS analysis_date,
              i.macd_histogram::text
       FROM ${table} i
       JOIN ${tickerTable} t ON i.${fk} = t.id
       WHERE i.indicator_time >= CURRENT_DATE - INTERVAL '2 days'${symbolClause}
       ORDER BY t.symbol,
                (i.indicator_time AT TIME ZONE 'America/New_York')::date,
                i.indicator_time DESC
     )
     SELECT * FROM daily ORDER BY ticker_symbol, analysis_date DESC`,
    params,
  );
  return rows;
}

/**
 * Latest analyst recommendation mix per stock from
 * `analysis_indicators_stock_pro`. Analyst columns are written on separate
 * rows than the technical-indicator rows, so we filter to rows that
 * actually carry a consensus and take the most recent per symbol.
 *
 * Stocks only (crypto/ETF/index have no Wall Street coverage). Resilient by
 * design: any DB error degrades to an empty map so the digest still renders
 * via the price-level fallback. Returns a map keyed by UPPER(symbol).
 */
export async function fetchAnalystMix(
  db: Pool,
  symbolFilter?: string,
): Promise<Map<string, AnalystMix>> {
  const out = new Map<string, AnalystMix>();
  try {
    const params: unknown[] = [];
    let symbolClause = "";
    if (symbolFilter) {
      symbolClause = " AND UPPER(t.symbol) = UPPER($1)";
      params.push(symbolFilter);
    }

    const { rows } = await db.query<AnalystMixRow>(
      `SELECT DISTINCT ON (t.symbol)
              t.symbol AS ticker_symbol,
              p.analyst_strong_buy,
              p.analyst_buy,
              p.analyst_hold,
              p.analyst_sell,
              p.analyst_strong_sell,
              p.analyst_consensus
       FROM analysis_indicators_stock_pro p
       JOIN stock_tickers t ON t.id = p.stock_ticker_id
       WHERE p.analyst_consensus IS NOT NULL${symbolClause}
       ORDER BY t.symbol, p.indicator_time DESC`,
      params,
    );

    for (const r of rows) {
      const mix = computeAnalystMix(
        r.analyst_strong_buy ?? 0,
        r.analyst_buy ?? 0,
        r.analyst_hold ?? 0,
        r.analyst_sell ?? 0,
        r.analyst_strong_sell ?? 0,
        r.analyst_consensus,
      );
      if (mix) out.set(r.ticker_symbol.toUpperCase(), mix);
    }
  } catch {
    /* non-critical: missing pro table / analyst cols degrade to empty map */
  }
  return out;
}

/**
 * Presentation + range + long-trend extras for the Smart Digest card, keyed
 * by UPPER(symbol). Stocks: `stock_tickers` (name, logo), the eToro-derived
 * `analysis_stock_trend_metrics` (52-week range + SMA-50/200 + EMA-50,
 * preferred — same instrument as the price feed, covers indexes/ETFs) with
 * `analysis_stock_fundamentals` (Finnhub) as the 52-week fallback.
 *
 * `logoDataUri` is a self-contained `data:` URI built from the stored
 * `logo_bytes` so the renderer embeds the image with no network call.
 */
export interface StockCardExtras {
  companyName?: string;
  logoDataUri?: string;
  week52High?: number;
  week52Low?: number;
  /** 50-day simple MA from daily bars (eToro/Alpaca). */
  sma50?: number;
  /** 200-day simple MA from daily bars. */
  sma200?: number;
  /** True daily EMA-50 from daily bars. */
  ema50?: number;
  /** ISO timestamp the trend metrics row was computed at. */
  trendAsOf?: string;
}

interface StockCardExtrasRow {
  ticker_symbol: string;
  company_name: string | null;
  logo_bytes: Buffer | null;
  logo_content_type: string | null;
  week_52_high: string | null;
  week_52_low: string | null;
  sma_50: string | null;
  sma_200: string | null;
  ema_50: string | null;
  trend_computed_at: string | null;
}

function applyTrendColumns(
  extras: StockCardExtras,
  r: { sma_50: string | null; sma_200: string | null; ema_50: string | null; trend_computed_at: string | null },
): void {
  const sma50 = r.sma_50 != null ? parseFloat(r.sma_50) : NaN;
  const sma200 = r.sma_200 != null ? parseFloat(r.sma_200) : NaN;
  const ema50 = r.ema_50 != null ? parseFloat(r.ema_50) : NaN;
  if (Number.isFinite(sma50) && sma50 > 0) extras.sma50 = sma50;
  if (Number.isFinite(sma200) && sma200 > 0) extras.sma200 = sma200;
  if (Number.isFinite(ema50) && ema50 > 0) extras.ema50 = ema50;
  if (r.trend_computed_at) extras.trendAsOf = r.trend_computed_at;
}

/**
 * Fetch logo / company name / 52-week range / long MAs for stocks. Resilient
 * by design: any DB error (e.g. trend table not yet migrated) degrades to an
 * empty map so the card still renders without these extras.
 */
export async function fetchStockCardExtras(
  db: Pool,
  symbolFilter?: string,
): Promise<Map<string, StockCardExtras>> {
  const out = new Map<string, StockCardExtras>();
  try {
    const params: unknown[] = [];
    let symbolClause = "";
    if (symbolFilter) {
      symbolClause = " AND UPPER(t.symbol) = UPPER($1)";
      params.push(symbolFilter);
    }

    const { rows } = await db.query<StockCardExtrasRow>(
      `SELECT t.symbol AS ticker_symbol,
              t.name   AS company_name,
              t.logo_bytes,
              t.logo_content_type,
              COALESCE(tm.week_52_high, f.week_52_high)::text AS week_52_high,
              COALESCE(tm.week_52_low,  f.week_52_low)::text  AS week_52_low,
              tm.sma_50::text  AS sma_50,
              tm.sma_200::text AS sma_200,
              tm.ema_50::text  AS ema_50,
              tm.computed_at::text AS trend_computed_at
       FROM stock_tickers t
       LEFT JOIN LATERAL (
         SELECT week_52_high, week_52_low
         FROM analysis_stock_fundamentals
         WHERE stock_ticker_id = t.id
         ORDER BY fiscal_year DESC, fiscal_quarter DESC
         LIMIT 1
       ) f ON true
       LEFT JOIN analysis_stock_trend_metrics tm
         ON tm.stock_ticker_id = t.id
        AND tm.computed_at >= NOW() - INTERVAL '7 days'
       WHERE t.is_active = true${symbolClause}`,
      params,
    );

    for (const r of rows) {
      const extras: StockCardExtras = {};
      if (r.company_name && r.company_name.trim().length > 0) {
        extras.companyName = r.company_name.trim();
      }
      if (r.logo_bytes && r.logo_bytes.length > 0) {
        const ct = r.logo_content_type || "image/png";
        extras.logoDataUri = `data:${ct};base64,${r.logo_bytes.toString("base64")}`;
      }
      const high = r.week_52_high != null ? parseFloat(r.week_52_high) : NaN;
      const low = r.week_52_low != null ? parseFloat(r.week_52_low) : NaN;
      if (Number.isFinite(high) && high > 0) extras.week52High = high;
      if (Number.isFinite(low) && low > 0) extras.week52Low = low;
      applyTrendColumns(extras, r);

      if (
        extras.companyName ||
        extras.logoDataUri ||
        extras.week52High != null ||
        extras.week52Low != null ||
        extras.sma200 != null ||
        extras.sma50 != null
      ) {
        out.set(r.ticker_symbol.toUpperCase(), extras);
      }
    }
  } catch {
    /* non-critical: missing logo/52w/trend columns degrade to empty map */
  }
  return out;
}

interface CryptoCardExtrasRow {
  ticker_symbol: string;
  company_name: string | null;
  week_52_high: string | null;
  week_52_low: string | null;
  sma_50: string | null;
  sma_200: string | null;
  ema_50: string | null;
  trend_computed_at: string | null;
}

/**
 * Crypto counterpart of {@link fetchStockCardExtras}: coin name from
 * `crypto_tickers` plus the Alpaca-derived 52-week range and long MAs from
 * `analysis_crypto_range_52w` (no logos — logo columns are stock-only).
 * Ranges older than 7 days are treated as missing so a stalled worker
 * degrades to the period-range fallback instead of a stale frame.
 */
export async function fetchCryptoCardExtras(
  db: Pool,
  symbolFilter?: string,
): Promise<Map<string, StockCardExtras>> {
  const out = new Map<string, StockCardExtras>();
  try {
    const params: unknown[] = [];
    let symbolClause = "";
    if (symbolFilter) {
      symbolClause = " AND UPPER(t.symbol) = UPPER($1)";
      params.push(symbolFilter);
    }

    const { rows } = await db.query<CryptoCardExtrasRow>(
      `SELECT t.symbol AS ticker_symbol,
              t.name   AS company_name,
              r.week_52_high::text AS week_52_high,
              r.week_52_low::text  AS week_52_low,
              r.sma_50::text  AS sma_50,
              r.sma_200::text AS sma_200,
              r.ema_50::text  AS ema_50,
              r.computed_at::text AS trend_computed_at
       FROM crypto_tickers t
       LEFT JOIN analysis_crypto_range_52w r
         ON r.crypto_ticker_id = t.id
        AND r.computed_at >= NOW() - INTERVAL '7 days'
       WHERE t.is_active = true${symbolClause}`,
      params,
    );

    for (const r of rows) {
      const extras: StockCardExtras = {};
      if (r.company_name && r.company_name.trim().length > 0) {
        extras.companyName = r.company_name.trim();
      }
      const high = r.week_52_high != null ? parseFloat(r.week_52_high) : NaN;
      const low = r.week_52_low != null ? parseFloat(r.week_52_low) : NaN;
      if (Number.isFinite(high) && high > 0) extras.week52High = high;
      if (Number.isFinite(low) && low > 0) extras.week52Low = low;
      applyTrendColumns(extras, r);

      if (
        extras.companyName ||
        extras.week52High != null ||
        extras.week52Low != null ||
        extras.sma200 != null ||
        extras.sma50 != null
      ) {
        out.set(r.ticker_symbol.toUpperCase(), extras);
      }
    }
  } catch {
    /* non-critical: missing range table degrades to empty map */
  }
  return out;
}

/**
 * Daily technical levels for the Smart Digest "Levels to Watch" zones, keyed
 * by UPPER(symbol). Sourced from the latest indicator row (≤ 7 days old) of
 * `analysis_indicators_{stock,crypto}_pro`: classic daily pivots, Fibonacci
 * retracements of the 50-day swing, and ATR for zone widths.
 */
export interface TechLevels {
  pivot?: {
    s1?: number;
    s2?: number;
    s3?: number;
    r1?: number;
    r2?: number;
    r3?: number;
  };
  /** Interior fib retracement prices (0.236 … 0.786), unvalidated. */
  fibLevels?: number[];
  /** Average true range in absolute price units. */
  atr?: number;
  /** ISO timestamp of the indicator row the levels came from. */
  asOf?: string;
}

interface TechLevelsRow {
  ticker_symbol: string;
  pivot_levels: Record<string, unknown> | null;
  fibonacci_levels: { levels?: Record<string, unknown> } | null;
  atr: string | null;
  indicator_time: Date | string;
}

/** Fib retracements rendered as zone anchors; 0.0/1.0 duplicate the swing. */
const FIB_INTERIOR_KEYS = ["0.236", "0.382", "0.5", "0.618", "0.786"] as const;

function jsonNum(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Fetch pivots / fib levels / ATR per symbol. Resilient by design: any DB
 * error degrades to an empty map and the card falls back to the statistical
 * 25% zones. Rows carrying only analyst data (stock pro table mixes both)
 * are excluded via the `pivot_levels IS NOT NULL …` predicate.
 */
export async function fetchTechLevels(
  db: Pool,
  assetType: "stock" | "crypto",
  symbolFilter?: string,
): Promise<Map<string, TechLevels>> {
  const out = new Map<string, TechLevels>();
  try {
    const isStock = assetType === "stock";
    const table = isStock
      ? "analysis_indicators_stock_pro"
      : "analysis_indicators_crypto_pro";
    const tickerTable = isStock ? "stock_tickers" : "crypto_tickers";
    const fk = isStock ? "stock_ticker_id" : "crypto_ticker_id";

    const params: unknown[] = [];
    let symbolClause = "";
    if (symbolFilter) {
      symbolClause = " AND UPPER(t.symbol) = UPPER($1)";
      params.push(symbolFilter);
    }

    const { rows } = await db.query<TechLevelsRow>(
      `SELECT DISTINCT ON (t.symbol)
              t.symbol AS ticker_symbol,
              p.pivot_levels,
              p.fibonacci_levels,
              p.atr::text AS atr,
              p.indicator_time
       FROM ${table} p
       JOIN ${tickerTable} t ON t.id = p.${fk}
       WHERE (p.pivot_levels IS NOT NULL
              OR p.fibonacci_levels IS NOT NULL
              OR p.atr IS NOT NULL)
         AND p.indicator_time >= NOW() - INTERVAL '7 days'${symbolClause}
       ORDER BY t.symbol, p.indicator_time DESC`,
      params,
    );

    for (const r of rows) {
      const levels: TechLevels = {};

      if (r.pivot_levels && typeof r.pivot_levels === "object") {
        const p = r.pivot_levels;
        const pivot: NonNullable<TechLevels["pivot"]> = {};
        for (const key of ["s1", "s2", "s3", "r1", "r2", "r3"] as const) {
          const n = jsonNum(p[key]);
          if (n !== undefined) pivot[key] = n;
        }
        if (Object.keys(pivot).length > 0) levels.pivot = pivot;
      }

      const fibMap = r.fibonacci_levels?.levels;
      if (fibMap && typeof fibMap === "object") {
        const fibs = FIB_INTERIOR_KEYS.map((k) => jsonNum(fibMap[k])).filter(
          (n): n is number => n !== undefined,
        );
        if (fibs.length > 0) levels.fibLevels = fibs;
      }

      const atr = r.atr != null ? parseFloat(r.atr) : NaN;
      if (Number.isFinite(atr) && atr > 0) levels.atr = atr;

      if (levels.pivot || levels.fibLevels || levels.atr !== undefined) {
        levels.asOf =
          r.indicator_time instanceof Date
            ? r.indicator_time.toISOString()
            : String(r.indicator_time);
        out.set(r.ticker_symbol.toUpperCase(), levels);
      }
    }
  } catch {
    /* non-critical: missing pro table degrades to the 25% zone fallback */
  }
  return out;
}

async function fetchCandlesticks(
  db: Pool,
  assetType: "stock" | "crypto",
  symbolFilter?: string,
): Promise<CandlestickRow[]> {
  const isStock = assetType === "stock";
  const table = isStock
    ? "analysis_stock_candlestick_pattern"
    : "analysis_crypto_candlestick_pattern";
  const tickerTable = isStock ? "stock_tickers" : "crypto_tickers";
  const fk = isStock ? "stock_ticker_id" : "crypto_ticker_id";

  const params: unknown[] = [];
  let symbolClause = "";
  if (symbolFilter) {
    symbolClause = " AND UPPER(t.symbol) = UPPER($1)";
    params.push(symbolFilter);
  }

  const { rows } = await db.query<CandlestickRow>(
    `SELECT t.symbol AS ticker_symbol, cp.detected_patterns
     FROM ${table} cp
     JOIN ${tickerTable} t ON cp.${fk} = t.id
     WHERE cp.analysis_date = CURRENT_DATE${symbolClause}`,
    params,
  );
  return rows;
}

export interface NewsSentimentRow {
  symbol: string;
  article_count: number;
  avg_sentiment: string;
}

function mergeNewsSentimentRowsForDigestSymbol(
  rows: NewsSentimentRow[],
  digestSymbol: string,
): NewsSentimentRow[] {
  const primary = digestSymbol.toUpperCase();
  const candidates = new Set(
    newsLookupCandidateSymbols(digestSymbol).map((s) => s.toUpperCase()),
  );
  let themeCount = 0;
  let weightedSent = 0;
  for (const r of rows) {
    if (!candidates.has(r.symbol.toUpperCase())) continue;
    const n = Number(r.article_count);
    const av = toNum(r.avg_sentiment);
    if (!Number.isFinite(n) || n < 1 || av == null) continue;
    weightedSent += av * n;
    themeCount += n;
  }
  if (themeCount <= 0) return [];
  return [
    {
      symbol: primary,
      article_count: themeCount,
      avg_sentiment: String(weightedSent / themeCount),
    },
  ];
}

async function fetchNewsSentiment(
  db: Pool,
  symbolFilter?: string,
): Promise<NewsSentimentRow[]> {
  const params: unknown[] = [];
  let symbolClause = "";
  if (symbolFilter) {
    symbolClause = " AND affected_tickers && $1::text[]";
    params.push(newsLookupCandidateSymbols(symbolFilter));
  }

  const { rows } = await db.query<NewsSentimentRow>(
    `SELECT
       unnest(affected_tickers) AS symbol,
       COUNT(*) AS article_count,
       AVG(sentiment_score)::text AS avg_sentiment
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
       AND sentiment_score IS NOT NULL${symbolClause}
     GROUP BY unnest(affected_tickers)
     HAVING COUNT(*) >= 1`,
    params,
  );

  if (symbolFilter && rows.length > 0) {
    return mergeNewsSentimentRowsForDigestSymbol(rows, symbolFilter);
  }
  return rows;
}

interface NewsHeadlineRow {
  headline: string;
  affected_tickers: string[];
  news_one_liner: string | null;
  primary_ticker: string | null;
  primary_ticker_source: string | null;
  tickers_inferred: string[] | null;
}

interface FetchNewsHeadlinesResult {
  headlineMap: Map<string, string[]>;
  oneLinerMap: Map<string, string>;
}

async function fetchNewsHeadlines(
  db: Pool,
  symbolFilter?: string,
): Promise<FetchNewsHeadlinesResult> {
  const includeInferred = getIncludeInferredOnly();
  const params: unknown[] = [];
  let symbolClause = "";
  if (symbolFilter) {
    symbolClause = " AND (affected_tickers && $2::text[] OR ($3::bool AND tickers_inferred && $2::text[]))";
    params.push(newsLookupCandidateSymbols(symbolFilter));
    params.push(includeInferred);
  }

  const freshHours = getMemoryFreshnessHours();
  const { rows } = await db.query<NewsHeadlineRow>(
    `SELECT theme AS headline, affected_tickers, news_one_liner,
            primary_ticker, primary_ticker_source, tickers_inferred
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
       AND last_updated >= NOW() - ($1::int * INTERVAL '1 hour')${symbolClause}
     ORDER BY relevance_score DESC, last_updated DESC
     LIMIT 50`,
    [freshHours, ...params],
  );

  const headlineMap = new Map<string, string[]>();
  const oneLinerMap = new Map<string, string>();
  const affinityMin = getAffinityMin();
  for (const row of rows) {
    const keptTickers = row.affected_tickers ?? [];
    const inferredTickers = includeInferred ? (row.tickers_inferred ?? []) : [];
    for (const ticker of [...keptTickers, ...inferredTickers]) {
      // Per-(row, ticker) affinity: the same row may legitimately be on-symbol
      // for one ticker in `affected_tickers` and contaminated for another.
      // We use the bare ticker as the digest symbol and derive its alias set
      // (crypto base, index ETF) so SPX500's SPY-tagged rows still hit.
      const tickerUpper = (ticker ?? "").toUpperCase();
      if (!tickerUpper) continue;
      const aliases = newsLookupCandidateSymbols(tickerUpper).map((c) =>
        c.toUpperCase(),
      );
      const affinity = computeSymbolAffinity({
        theme: row.headline,
        newsOneLiner: row.news_one_liner,
        affectedTickers: row.affected_tickers ?? [],
        symbolUpper: tickerUpper,
        aliases,
        threshold: affinityMin,
        primaryTicker: row.primary_ticker,
        primarySource: coercePrimaryTickerSource(row.primary_ticker_source),
        tickersInferred: row.tickers_inferred ?? [],
      });
      if (!affinity.passed) continue;
      const existing = headlineMap.get(ticker) ?? [];
      if (existing.length < 3) {
        existing.push(row.headline);
        headlineMap.set(ticker, existing);
      }
      if (row.news_one_liner && !oneLinerMap.has(ticker)) {
        oneLinerMap.set(ticker, row.news_one_liner);
      }
    }
  }
  return { headlineMap, oneLinerMap };
}

// ── Per-ticker memory text ──────────────────────────────────────────

interface MemoryTextRow {
  /**
   * `theme` is loaded so the affinity scorer can match the digest symbol's
   * tokens against it (alongside `news_one_liner`). It is NOT persisted on
   * the returned `TickerMemoryText` — the brief composer never reads it.
   */
  theme: string | null;
  affected_tickers: string[];
  news_one_liner: string | null;
  summary: string | null;
  key_facts: string[] | null;
  market_implications: string | null;
  impact_level: string | null;
  relevance_score: string | null;
  sentiment_score: string | null;
  last_updated: string | null;
  primary_ticker: string | null;
  primary_ticker_source: string | null;
  tickers_inferred: string[] | null;
}

const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function rowImpactRank(row: MemoryTextRow): number {
  const lvl = (row.impact_level ?? "").toLowerCase();
  return IMPACT_RANK[lvl] ?? 9;
}

function rowRelevance(row: MemoryTextRow): number {
  const n = toNum(row.relevance_score);
  return n ?? 0;
}

function rowLastUpdatedMs(row: MemoryTextRow): number {
  if (!row.last_updated) return 0;
  const t = Date.parse(row.last_updated);
  return Number.isFinite(t) ? t : 0;
}

function normalizeImpact(
  v: string | null,
): TickerMemoryText["impactLevel"] | undefined {
  const lvl = (v ?? "").toLowerCase();
  if (lvl === "critical" || lvl === "high" || lvl === "medium" || lvl === "low") {
    return lvl;
  }
  return undefined;
}

function rowToMemoryText(row: MemoryTextRow): TickerMemoryText {
  const out: TickerMemoryText = {};
  if (row.news_one_liner && row.news_one_liner.trim().length > 0) {
    out.newsOneLiner = row.news_one_liner.trim();
  }
  if (row.summary && row.summary.trim().length > 0) {
    out.summary = row.summary.trim();
  }
  if (Array.isArray(row.key_facts) && row.key_facts.length > 0) {
    out.keyFacts = row.key_facts;
  }
  if (row.market_implications && row.market_implications.trim().length > 0) {
    out.marketImplications = row.market_implications.trim();
  }
  const impact = normalizeImpact(row.impact_level);
  if (impact) out.impactLevel = impact;
  const relevance = toNum(row.relevance_score);
  if (relevance != null) out.relevanceScore = relevance;
  const sentiment = toNum(row.sentiment_score);
  if (sentiment != null) out.sentimentScore = sentiment;
  if (row.last_updated) out.lastUpdated = row.last_updated;
  return out;
}

/**
 * Load per-ticker curated text from `analysis_market_memory` for the
 * given digest symbols, keyed by the **digest symbol** the caller asked
 * for (i.e. index aliases like `SPX500 -> SPY` are resolved here using
 * `newsLookupCandidateSymbols`).
 *
 * Step-3 contamination defence: every candidate row is scored against the
 * digest symbol via `computeSymbolAffinity` (theme + news_one_liner only).
 * Rows below `getAffinityMin()` are excluded so a row whose
 * `affected_tickers` membership is incidental (e.g. an Ethereum-primary
 * theme that lists BTC) cannot win the per-symbol slot.
 *
 * Ranking among rows that pass affinity (Step-5 association model — see
 * `compareMemoryCandidates` for the full rationale):
 *   1. lowest IMPACT_RANK            (hard primary)
 *   2. highest affinity score        (hard secondary)
 *   3. highest composite score
 *        = relevance * freshnessDecay + ONE_LINER_ON_SYMBOL_BONUS
 *   4. freshest `last_updated`       (final tiebreak)
 *
 * Filters: `status IN ('active','fading')` to mirror the rest of the
 * Smart Digest data flow.
 */
export async function fetchTickerMemoryText(
  db: Pool,
  symbols: string[],
): Promise<Map<string, TickerMemoryText>> {
  const out = new Map<string, TickerMemoryText>();
  if (symbols.length === 0) return out;

  // Build the union of candidate symbols (incl. crypto base + index aliases)
  // so the SQL filter is a single `&&` against `affected_tickers`.
  const candidatesUnion = new Set<string>();
  const candidatesPerDigest = new Map<string, string[]>();
  for (const s of symbols) {
    const cands = newsLookupCandidateSymbols(s).map((c) => c.toUpperCase());
    candidatesPerDigest.set(s.toUpperCase(), cands);
    for (const c of cands) candidatesUnion.add(c);
  }

  const includeInferred = getIncludeInferredOnly();
  const freshHours = getMemoryFreshnessHours();
  const { rows } = await db.query<MemoryTextRow>(
    `SELECT theme, affected_tickers, news_one_liner, summary, key_facts,
            market_implications, impact_level,
            relevance_score::text, sentiment_score::text,
            last_updated::text,
            primary_ticker, primary_ticker_source, tickers_inferred
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
       AND last_updated >= NOW() - ($2::int * INTERVAL '1 hour')
       AND (affected_tickers && $1::text[]
            OR ($3::bool AND tickers_inferred && $1::text[]))`,
    [Array.from(candidatesUnion), freshHours, includeInferred],
  );

  if (rows.length === 0) return out;

  const affinityMin = getAffinityMin();

  for (const [digestSym, cands] of candidatesPerDigest) {
    const candSet = new Set(cands);
    let best: CandidateInput | undefined;
    for (const row of rows) {
      const tickers = row.affected_tickers ?? [];
      const inferred = row.tickers_inferred ?? [];
      const keptHit = tickers.some((t) => candSet.has((t ?? "").toUpperCase()));
      const inferredHit =
        includeInferred &&
        inferred.some((t) => candSet.has((t ?? "").toUpperCase()));
      if (!keptHit && !inferredHit) continue;
      const affinity = computeSymbolAffinity({
        theme: row.theme,
        newsOneLiner: row.news_one_liner,
        affectedTickers: tickers,
        symbolUpper: digestSym,
        aliases: cands,
        threshold: affinityMin,
        primaryTicker: row.primary_ticker,
        primarySource: coercePrimaryTickerSource(row.primary_ticker_source),
        tickersInferred: row.tickers_inferred ?? [],
      });
      if (!affinity.passed) continue;
      const candidate: CandidateInput = {
        row,
        affinity,
        oneLinerOnSymbol: textMentionsAnyAlias(row.news_one_liner, cands),
        halfLifeHours: freshHours,
      };
      if (!best) {
        best = candidate;
        continue;
      }
      if (compareMemoryCandidates(candidate, best) < 0) {
        best = candidate;
      }
    }
    if (best) {
      out.set(digestSym, rowToMemoryText(best.row));
    }
  }

  return out;
}

// ── Step-5 association ranking model ────────────────────────────────
//
// Two related decisions live in the digest stack: (1) which memory row
// is the best ASSOCIATION for a digest symbol, and (2) whether that row
// is good enough to SURFACE as a user-facing context line. This file
// owns (1); `digest-brief-truth.ts` owns (2). They share inputs but
// produce independent outputs.
//
// Ordering (top-down, all stable / deterministic / pure):
//   1. impactRank ASC          (hard primary — curator-stated impact)
//   2. affinityScore DESC      (hard secondary — Step-3 contamination defence)
//   3. compositeScore DESC     (graded — collapses three correlated weak
//                               signals: relevance, freshness decay,
//                               one-liner-on-symbol bonus)
//   4. last_updated DESC       (final tiebreak)
//
// Why impact stays a hard primary: curator-stated impact has been the
// most reliable signal for editorial salience. Step 5 keeps it on top
// as the starting hypothesis. If live validation shows a stale
// `critical` row producing materially worse user-facing context than a
// fresh `high` row in a way that harms digest quality, the ranking
// model can be revised.

/**
 * One-liner-on-symbol bonus added to the composite score so a row whose
 * `news_one_liner` actually names the digest symbol nudges past an
 * equally-fresh-and-relevant peer whose line is sector-flavoured. Sized
 * to clearly outweigh sub-decimal relevance/freshness deltas without
 * dominating across impact or affinity classes.
 */
const ONE_LINER_ON_SYMBOL_BONUS = 0.25;

/**
 * Linear freshness decay shared with the in-process freshness window
 * (`getMemoryFreshnessHours()`, default 72h).
 *
 *   age 0h    -> 1.0
 *   age 36h   -> 0.5
 *   age 72h+  -> 0.0
 *
 * Linear (not exponential) is intentional: easy to read in the debug
 * envelope and matches the binary gate's edge so rows that escaped the
 * SQL filter never multiply against negative weights.
 */
export function freshnessDecay(
  ageHours: number,
  halfLifeHours: number,
): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 1;
  if (!Number.isFinite(halfLifeHours) || halfLifeHours <= 0) return 0;
  const v = 1 - ageHours / halfLifeHours;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/**
 * Composite association score — the graded tertiary key in the ranking.
 * Pure: depends only on relevance, age (vs the half-life), and whether
 * the one-liner names the symbol. Exported for the debug surface.
 */
export function compositeAssociationScore(args: {
  relevance: number;
  ageHours: number;
  halfLifeHours: number;
  oneLinerOnSymbol: boolean;
}): number {
  const decayed = args.relevance * freshnessDecay(args.ageHours, args.halfLifeHours);
  return decayed + (args.oneLinerOnSymbol ? ONE_LINER_ON_SYMBOL_BONUS : 0);
}

interface CandidateInput {
  row: MemoryTextRow;
  affinity: AffinityResult;
  oneLinerOnSymbol: boolean;
  halfLifeHours: number;
}

/**
 * Compare two memory candidates by the Step-5 association ranking key.
 * Returns a negative number when `a` should win, positive when `b`
 * should win, zero on full tie.
 */
function compareMemoryCandidates(
  a: CandidateInput,
  b: CandidateInput,
): number {
  const impactDelta = rowImpactRank(a.row) - rowImpactRank(b.row);
  if (impactDelta !== 0) return impactDelta;
  const affinityDelta = b.affinity.score - a.affinity.score;
  if (affinityDelta !== 0) return affinityDelta;
  const compositeA = compositeAssociationScore({
    relevance: rowRelevance(a.row),
    ageHours: ageHoursFromRow(a.row),
    halfLifeHours: a.halfLifeHours,
    oneLinerOnSymbol: a.oneLinerOnSymbol,
  });
  const compositeB = compositeAssociationScore({
    relevance: rowRelevance(b.row),
    ageHours: ageHoursFromRow(b.row),
    halfLifeHours: b.halfLifeHours,
    oneLinerOnSymbol: b.oneLinerOnSymbol,
  });
  if (compositeA !== compositeB) return compositeB - compositeA;
  const tsA = rowLastUpdatedMs(a.row);
  const tsB = rowLastUpdatedMs(b.row);
  return tsB - tsA;
}

function ageHoursFromRow(row: MemoryTextRow): number {
  const ms = rowLastUpdatedMs(row);
  if (ms <= 0) return Number.POSITIVE_INFINITY;
  const ageMs = Date.now() - ms;
  if (ageMs <= 0) return 0;
  return ageMs / 3_600_000;
}

// ── Macro context ────────────────────────────────────────────────────

export interface MacroContext {
  headlines: string[];
  dominantTheme: string | null;
  overallSentiment: number;
}

/**
 * Minimum number of `analysis_market_memory` rows that must agree on a
 * single `category` for `dominantTheme` to be set. Below this gate the
 * macro context is too thin to drive a context line and we emit a null
 * theme. Sentiment averaging still uses every fresh row (so the header
 * `overallSentiment` remains representative for downstream sanity).
 *
 * Empirically chosen to match the digest brief's macro fallback gate
 * (`MACRO_SENTIMENT_GATE = 0.3`): both gates must clear before macro is
 * material enough to surface as `context`.
 */
const MACRO_DOMINANT_THEME_MIN_AGREEMENT = 3;

export async function fetchMacroContext(db: Pool): Promise<MacroContext> {
  const freshHours = getMemoryFreshnessHours();
  const { rows } = await db.query<{
    title: string;
    description: string | null;
    category: string;
    sentiment_score: string | null;
  }>(
    `SELECT theme AS title, summary AS description, category,
            sentiment_score::text
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
       AND category IN ('macro', 'geopolitical', 'policy')
       AND last_updated >= NOW() - ($1::int * INTERVAL '1 hour')
     ORDER BY
       CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       relevance_score DESC,
       last_updated DESC
     LIMIT 10`,
    [freshHours],
  );

  if (rows.length === 0) {
    return { headlines: [], dominantTheme: null, overallSentiment: 0 };
  }

  const headlines = rows.map((r) => r.title);

  const categoryCounts = new Map<string, number>();
  let sentimentSum = 0;
  let sentimentCount = 0;

  for (const r of rows) {
    categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
    const s = toNum(r.sentiment_score);
    if (s != null) {
      sentimentSum += s;
      sentimentCount++;
    }
  }

  // B2: Require >= MACRO_DOMINANT_THEME_MIN_AGREEMENT rows on a single
  // category before we trust a theme. A two-way "split" (e.g. 1 macro + 1
  // policy + 1 geopolitical) used to silently elect the alphabetically
  // first one, which produced misleading "Macro headlines lean negative"
  // strings whenever any one category nudged ahead by a single row.
  let dominantTheme: string | null = null;
  let maxCount = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantTheme = cat;
    }
  }
  if (maxCount < MACRO_DOMINANT_THEME_MIN_AGREEMENT) {
    dominantTheme = null;
  }

  return {
    headlines,
    dominantTheme,
    overallSentiment: sentimentCount > 0 ? sentimentSum / sentimentCount : 0,
  };
}

// ── Context assembly ────────────────────────────────────────────────────

export interface TickerCtx {
  symbol: string;
  assetType: "stock" | "crypto";
  close: number;
  latestOpen?: number;
  daySignal: SignalDir;
  swingSignal: SignalDir;
  longTermSignal: SignalDir;
  alignment: "full" | "partial" | "conflict";
  swing?: PriceTargetRow;
  swingYesterday?: PriceTargetRow;
  todayMacdHist?: number;
  yesterdayMacdHist?: number;
  patterns: Array<{ pattern: string; confidence: number; signal: string }>;
  meta?: PriceTargetMeta;
  confidence?: number;
  /** ISO YYYY-MM-DD analysis_date from the swing/long-term price target row. */
  analysisDate?: string;
  /** Per-ticker memory text loaded by `fetchTickerMemoryText`. */
  memoryText?: TickerMemoryText;
}

export function buildContexts(
  assetType: "stock" | "crypto",
  targets: PriceTargetRow[],
  indicators: IndicatorRow[],
  candles: CandlestickRow[],
): TickerCtx[] {
  const ptBySymbol = groupBy(targets);
  const indBySymbol = groupBy(indicators);
  const candleMap = new Map<string, CandlestickRow>();
  for (const c of candles) candleMap.set(c.ticker_symbol, c);

  const ctxs: TickerCtx[] = [];

  for (const [symbol, rows] of ptBySymbol) {
    const byTrader = new Map<
      string,
      { today?: PriceTargetRow; yesterday?: PriceTargetRow }
    >();

    for (const r of rows) {
      const slot = byTrader.get(r.trader_type) ?? {};
      if (!slot.today) {
        slot.today = r;
      } else if (!slot.yesterday) {
        slot.yesterday = r;
      }
      byTrader.set(r.trader_type, slot);
    }

    const daySlot = byTrader.get("day");
    const swingSlot = byTrader.get("swing");
    const longSlot = byTrader.get("long_term");

    const daySignal = toSig(daySlot?.today?.signal_summary);
    const swingSignal = toSig(swingSlot?.today?.signal_summary);
    const longTermSignal = toSig(longSlot?.today?.signal_summary);

    const primary = swingSlot?.today ?? longSlot?.today ?? daySlot?.today;
    if (!primary) continue;

    const close = toNum(primary.latest_close);
    if (close == null) continue;
    const latestOpen = toNum(primary.latest_open);

    const alignment = computeAlignment(daySignal, swingSignal, longTermSignal);

    const indRows = indBySymbol.get(symbol) ?? [];
    const todayHist = indRows[0]?.macd_histogram != null ? Number(indRows[0].macd_histogram) : undefined;
    const yesterdayHist = indRows[1]?.macd_histogram != null ? Number(indRows[1].macd_histogram) : undefined;

    const candle = candleMap.get(symbol);
    const patterns = Array.isArray(candle?.detected_patterns)
      ? candle.detected_patterns
      : [];

    const meta = (swingSlot?.today?.metadata ?? longSlot?.today?.metadata) as
      | PriceTargetMeta
      | null
      | undefined;

    // analysisDate sourced from whichever row drove `primary` so the
    // brief footer can show "data as of <trading day>" rather than a
    // wall-clock send time.
    const analysisDate = primary.analysis_date;

    ctxs.push({
      symbol,
      assetType,
      close,
      latestOpen,
      daySignal,
      swingSignal,
      longTermSignal,
      alignment,
      swing: swingSlot?.today,
      swingYesterday: swingSlot?.yesterday,
      todayMacdHist: Number.isFinite(todayHist) ? todayHist : undefined,
      yesterdayMacdHist: Number.isFinite(yesterdayHist)
        ? yesterdayHist
        : undefined,
      patterns,
      meta: meta ?? undefined,
      confidence: toNum(
        swingSlot?.today?.confidence ?? longSlot?.today?.confidence,
      ),
      analysisDate: analysisDate && analysisDate.length > 0 ? analysisDate : undefined,
    });
  }

  return ctxs;
}

// ── Signal detection ────────────────────────────────────────────────────

const ENTRY_BUFFER_PCT = 0.02;
const PATTERN_MIN_CONFIDENCE = 0.8;

function makeRawData(ctx: TickerCtx): TickerSignal["rawData"] {
  const raw: TickerSignal["rawData"] = {
    close: ctx.close,
    daySignal: ctx.daySignal,
    swingSignal: ctx.swingSignal,
    longTermSignal: ctx.longTermSignal,
  };

  if (ctx.latestOpen != null) raw.latestOpen = ctx.latestOpen;

  if (ctx.swing) {
    raw.entryLow = toNum(ctx.swing.entry_price_low);
    raw.entryHigh = toNum(ctx.swing.entry_price_high);
    raw.targetPrice = toNum(ctx.swing.target_price);
    raw.stopLoss = toNum(ctx.swing.stop_loss);
  }

  if (ctx.meta) {
    raw.rsi = ctx.meta.rsi;
    raw.ema20 = ctx.meta.ema_20;
    raw.ema50 = ctx.meta.ema_50;
    raw.periodLow = ctx.meta.low_period;
    raw.periodHigh = ctx.meta.high_period;
    raw.lookbackDays = ctx.meta.lookback_days;
  }

  if (ctx.confidence != null) raw.confidence = ctx.confidence;
  if (ctx.patterns.length > 0) raw.patterns = ctx.patterns;
  if (ctx.todayMacdHist != null) raw.macdHistogram = ctx.todayMacdHist;
  if (ctx.yesterdayMacdHist != null)
    raw.previousMacdHistogram = ctx.yesterdayMacdHist;

  return raw;
}

export function detectForTicker(ctx: TickerCtx): TickerSignal[] {
  const out: TickerSignal[] = [];
  const { symbol, assetType, close, alignment, swing } = ctx;

  // 1. Entry zone — close within entry range (with small buffer)
  if (swing && alignment !== "conflict") {
    const lo = toNum(swing.entry_price_low);
    const hi = toNum(swing.entry_price_high);
    if (lo != null && hi != null) {
      const buf = hi * ENTRY_BUFFER_PCT;
      if (close >= lo - buf && close <= hi + buf) {
        out.push({
          symbol,
          assetType,
          type: "entry_zone",
          priority: alignment === "full" ? "high" : "medium",
          timeframeAlignment: alignment,
          headline: `${symbol} is near a key support level ($${fmtPrice(lo)}–$${fmtPrice(hi)})`,
          rawData: makeRawData(ctx),
        });
      }
    }
  }

  // 2. Target reached — close >= target while signal is bullish
  if (swing && ctx.swingSignal === "bullish") {
    const target = toNum(swing.target_price);
    if (target != null && close >= target) {
      out.push({
        symbol,
        assetType,
        type: "target_reached",
        priority: "high",
        timeframeAlignment: alignment,
        headline: `${symbol} approaching resistance at $${fmtPrice(target)}`,
        rawData: makeRawData(ctx),
      });
    }
  }

  // 3. Stop loss warning — close breached stop loss level
  if (swing) {
    const sl = toNum(swing.stop_loss);
    if (sl != null && close <= sl) {
      out.push({
        symbol,
        assetType,
        type: "stop_loss_warning",
        priority: "high",
        timeframeAlignment: alignment,
        headline: `${symbol} below invalidation level at $${fmtPrice(sl)}`,
        rawData: makeRawData(ctx),
      });
    }
  }

  // 4. Signal change — swing signal flipped from yesterday
  if (swing && ctx.swingYesterday && alignment !== "conflict") {
    const prev = toSig(ctx.swingYesterday.signal_summary);
    const curr = ctx.swingSignal;
    if (prev !== curr) {
      const raw = makeRawData(ctx);
      raw.previousSignal = prev;
      raw.currentSignal = curr;
      out.push({
        symbol,
        assetType,
        type: "signal_change",
        priority: curr === "bullish" || prev === "bullish" ? "high" : "medium",
        timeframeAlignment: alignment,
        headline: `${symbol} swing signal changed from ${prev} to ${curr}`,
        rawData: raw,
      });
    }
  }

  // 5. Momentum shift — MACD histogram sign flip
  if (ctx.todayMacdHist != null && ctx.yesterdayMacdHist != null) {
    const flipped =
      (ctx.todayMacdHist > 0 && ctx.yesterdayMacdHist < 0) ||
      (ctx.todayMacdHist < 0 && ctx.yesterdayMacdHist > 0);
    if (flipped) {
      const dir = ctx.todayMacdHist > 0 ? "bullish" : "bearish";
      out.push({
        symbol,
        assetType,
        type: "momentum_shift",
        priority: alignment === "conflict" ? "low" : "medium",
        timeframeAlignment: alignment,
        headline: `${symbol} MACD momentum shifted ${dir}`,
        rawData: makeRawData(ctx),
      });
    }
  }

  // 6. Notable candlestick patterns above confidence threshold
  for (const p of ctx.patterns) {
    if (p.confidence >= PATTERN_MIN_CONFIDENCE) {
      out.push({
        symbol,
        assetType,
        type: "notable_pattern",
        priority: p.confidence >= 0.9 ? "medium" : "low",
        timeframeAlignment: alignment,
        headline: `${symbol} shows ${p.pattern.replace(/_/g, " ")} pattern (${p.signal})`,
        rawData: makeRawData(ctx),
      });
    }
  }

  return out;
}

// ── Public API ──────────────────────────────────────────────────────────

export function detectNewsSentimentSignals(
  newsRows: NewsSentimentRow[],
  headlineMap: Map<string, string[]>,
  assetType: "stock" | "crypto",
  ctxBySymbol: Map<string, TickerCtx>,
): TickerSignal[] {
  const signals: TickerSignal[] = [];

  for (const row of newsRows) {
    const ctx = ctxBySymbol.get(row.symbol);
    // Without a technical context for this symbol, the news signal would
    // ship with no price/levels and be filtered out downstream anyway.
    if (!ctx) continue;

    const avg = toNum(row.avg_sentiment);
    if (avg == null) continue;
    const count = Number(row.article_count);

    let direction: "bullish" | "bearish" | null = null;
    if (avg >= 0.3) direction = "bullish";
    else if (avg <= -0.3) direction = "bearish";
    if (!direction) continue;

    const headlines = headlineMap.get(row.symbol) ?? [];
    const baseRaw = makeRawData(ctx);

    const newsScore = count * Math.abs(avg);
    const newsPriority: TickerSignal["priority"] =
      newsScore >= 6 ? "high" : newsScore >= 4 ? "medium" : "low";

    signals.push({
      symbol: row.symbol,
      assetType,
      type: "news_sentiment",
      priority: newsPriority,
      timeframeAlignment: ctx.alignment,
      headline: `${row.symbol} has ${direction} news sentiment (${count} articles, avg ${avg.toFixed(2)})`,
      rawData: {
        ...baseRaw,
        newsArticleCount: count,
        newsAvgSentiment: avg,
        newsSentimentLabel: direction,
        newsHeadlines: headlines.length > 0 ? headlines : undefined,
      },
    });
  }

  return signals;
}

export interface DetectSignalsResult {
  signals: TickerSignal[];
  macroContext: MacroContext;
  newsOneLinerMap: Map<string, string>;
  /** Per-digest-symbol curated memory text from `analysis_market_memory`. */
  memoryTextMap: Map<string, TickerMemoryText>;
  /** Per-symbol ISO YYYY-MM-DD analysis_date driving the price truth. */
  analysisDateMap: Map<string, string>;
  /** Per-stock Wall Street analyst Buy/Hold/Sell mix (stocks only). */
  analystMixMap: Map<string, AnalystMix>;
  /** Per-symbol logo / company name / 52-week range. */
  cardExtrasMap: Map<string, StockCardExtras>;
  /** Per-symbol daily pivots / fib levels / ATR for the levels-bar zones. */
  techLevelsMap: Map<string, TechLevels>;
  /**
   * Per-symbol technical contexts built from price targets / indicators /
   * candles. Exposed for preview/inspection tooling that wants to render a
   * card even when no signal fired (see `buildNeutralPreviewSignal`). Not used
   * by the production delivery path.
   */
  contexts?: TickerCtx[];
}

/**
 * Build a neutral, low-priority "levels snapshot" signal from a technical
 * context. Used only by preview tooling to render a representative card when
 * no real signal fired — never emitted by the production detectors. The new
 * card's stance/stars/levels/action-guide derive from the price truth, not the
 * signal type, so a neutral type yields an accurate at-a-glance view.
 */
export function buildNeutralPreviewSignal(ctx: TickerCtx): TickerSignal {
  return {
    symbol: ctx.symbol,
    assetType: ctx.assetType,
    type: "signal_change",
    priority: "low",
    timeframeAlignment: ctx.alignment,
    headline: `${ctx.symbol} levels snapshot`,
    rawData: makeRawData(ctx),
  };
}

export async function detectSignals(
  db: Pool,
  assetType: "stock" | "crypto",
): Promise<DetectSignalsResult> {
  const [targets, indicators, candles, macroContext, analystMixMap, cardExtrasMap, techLevelsMap] = await Promise.all([
    fetchPriceTargets(db, assetType),
    fetchIndicators(db, assetType),
    fetchCandlesticks(db, assetType),
    fetchMacroContext(db).catch(() => ({ headlines: [], dominantTheme: null, overallSentiment: 0 }) as MacroContext),
    assetType === "stock"
      ? fetchAnalystMix(db)
      : Promise.resolve(new Map<string, AnalystMix>()),
    assetType === "stock"
      ? fetchStockCardExtras(db)
      : fetchCryptoCardExtras(db),
    fetchTechLevels(db, assetType),
  ]);

  let newsRows: NewsSentimentRow[] = [];
  let headlineMap = new Map<string, string[]>();
  let oneLinerMap = new Map<string, string>();
  try {
    const [sentimentRows, headlineResult] = await Promise.all([
      fetchNewsSentiment(db),
      fetchNewsHeadlines(db),
    ]);
    newsRows = sentimentRows;
    headlineMap = headlineResult.headlineMap;
    oneLinerMap = headlineResult.oneLinerMap;
  } catch { /* non-critical: news table may not exist or be inaccessible */ }

  const contexts = buildContexts(assetType, targets, indicators, candles);

  let memoryTextMap = new Map<string, TickerMemoryText>();
  try {
    memoryTextMap = await fetchTickerMemoryText(
      db,
      contexts.map((c) => c.symbol),
    );
    for (const c of contexts) {
      const m = memoryTextMap.get(c.symbol.toUpperCase());
      if (m) c.memoryText = m;
    }
  } catch { /* non-critical: missing memory rows degrade context to empty */ }

  const technicalSignals = contexts.flatMap(detectForTicker);

  const ctxBySymbol = new Map<string, TickerCtx>();
  for (const c of contexts) ctxBySymbol.set(c.symbol, c);

  const newsSignals = detectNewsSentimentSignals(
    newsRows,
    headlineMap,
    assetType,
    ctxBySymbol,
  );

  const analysisDateMap = new Map<string, string>();
  for (const c of contexts) {
    if (c.analysisDate) analysisDateMap.set(c.symbol.toUpperCase(), c.analysisDate);
  }

  return {
    signals: [...technicalSignals, ...newsSignals],
    macroContext,
    newsOneLinerMap: oneLinerMap,
    memoryTextMap,
    analysisDateMap,
    analystMixMap,
    cardExtrasMap,
    techLevelsMap,
    contexts,
  };
}

export async function detectSignalsForTicker(
  db: Pool,
  symbol: string,
  assetType: "stock" | "crypto",
): Promise<DetectSignalsResult> {
  const [targets, indicators, candles, macroContext, analystMixMap, cardExtrasMap, techLevelsMap] = await Promise.all([
    fetchPriceTargets(db, assetType, symbol),
    fetchIndicators(db, assetType, symbol),
    fetchCandlesticks(db, assetType, symbol),
    fetchMacroContext(db).catch(() => ({ headlines: [], dominantTheme: null, overallSentiment: 0 }) as MacroContext),
    assetType === "stock"
      ? fetchAnalystMix(db, symbol)
      : Promise.resolve(new Map<string, AnalystMix>()),
    assetType === "stock"
      ? fetchStockCardExtras(db, symbol)
      : fetchCryptoCardExtras(db, symbol),
    fetchTechLevels(db, assetType, symbol),
  ]);

  let newsRows: NewsSentimentRow[] = [];
  let headlineMap = new Map<string, string[]>();
  let oneLinerMap = new Map<string, string>();
  try {
    const [sentimentRows, headlineResult] = await Promise.all([
      fetchNewsSentiment(db, symbol),
      fetchNewsHeadlines(db, symbol),
    ]);
    newsRows = sentimentRows;
    headlineMap = headlineResult.headlineMap;
    oneLinerMap = headlineResult.oneLinerMap;
    mergeHeadlineAndOneLinerMapsForDigestSymbol(symbol, headlineMap, oneLinerMap);
  } catch { /* non-critical */ }

  const contexts = buildContexts(assetType, targets, indicators, candles);

  let memoryTextMap = new Map<string, TickerMemoryText>();
  try {
    memoryTextMap = await fetchTickerMemoryText(db, [symbol]);
    for (const c of contexts) {
      const m =
        memoryTextMap.get(c.symbol.toUpperCase()) ??
        memoryTextMap.get(symbol.toUpperCase());
      if (m) c.memoryText = m;
    }
  } catch { /* non-critical */ }

  const technicalSignals = contexts.flatMap(detectForTicker);

  const ctxBySymbol = new Map<string, TickerCtx>();
  for (const c of contexts) ctxBySymbol.set(c.symbol, c);

  const newsSignals = detectNewsSentimentSignals(
    newsRows,
    headlineMap,
    assetType,
    ctxBySymbol,
  );

  const analysisDateMap = new Map<string, string>();
  for (const c of contexts) {
    if (c.analysisDate) analysisDateMap.set(c.symbol.toUpperCase(), c.analysisDate);
  }

  return {
    signals: [...technicalSignals, ...newsSignals],
    macroContext,
    newsOneLinerMap: oneLinerMap,
    memoryTextMap,
    analysisDateMap,
    analystMixMap,
    cardExtrasMap,
    techLevelsMap,
    contexts,
  };
}
