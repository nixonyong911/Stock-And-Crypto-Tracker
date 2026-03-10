import type { Pool } from "pg";

export interface TickerSignal {
  symbol: string;
  assetType: "stock" | "crypto";
  type:
    | "entry_zone"
    | "target_reached"
    | "stop_loss_warning"
    | "signal_change"
    | "momentum_shift"
    | "notable_pattern";
  priority: "high" | "medium" | "low";
  timeframeAlignment: "full" | "partial" | "conflict";
  headline: string;
  rawData: {
    close: number;
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
  };
}

// ── Internal row types ──────────────────────────────────────────────────

interface PriceTargetRow {
  ticker_symbol: string;
  asset_type: string;
  trader_type: string;
  analysis_date: string;
  latest_close: string;
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

interface IndicatorRow {
  ticker_symbol: string;
  analysis_date: string;
  macd_histogram: string | null;
}

interface CandlestickRow {
  ticker_symbol: string;
  detected_patterns: Array<{
    pattern: string;
    confidence: number;
    signal: string;
  }>;
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

function computeAlignment(
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
            latest_close::text,
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
  const table = isStock ? "analysis_stock_indicator" : "analysis_crypto_indicator";
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

// ── Context assembly ────────────────────────────────────────────────────

interface TickerCtx {
  symbol: string;
  assetType: "stock" | "crypto";
  close: number;
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
}

function buildContexts(
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

    ctxs.push({
      symbol,
      assetType,
      close,
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

function detectForTicker(ctx: TickerCtx): TickerSignal[] {
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
          headline: `${symbol} is near its entry zone ($${fmtPrice(lo)}–$${fmtPrice(hi)})`,
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
        headline: `${symbol} reached target price $${fmtPrice(target)}`,
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
        headline: `${symbol} breached stop loss at $${fmtPrice(sl)}`,
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

export async function detectSignals(
  db: Pool,
  assetType: "stock" | "crypto",
): Promise<TickerSignal[]> {
  const [targets, indicators, candles] = await Promise.all([
    fetchPriceTargets(db, assetType),
    fetchIndicators(db, assetType),
    fetchCandlesticks(db, assetType),
  ]);

  return buildContexts(assetType, targets, indicators, candles).flatMap(
    detectForTicker,
  );
}

export async function detectSignalsForTicker(
  db: Pool,
  symbol: string,
  assetType: "stock" | "crypto",
): Promise<TickerSignal[]> {
  const [targets, indicators, candles] = await Promise.all([
    fetchPriceTargets(db, assetType, symbol),
    fetchIndicators(db, assetType, symbol),
    fetchCandlesticks(db, assetType, symbol),
  ]);

  return buildContexts(assetType, targets, indicators, candles).flatMap(
    detectForTicker,
  );
}
