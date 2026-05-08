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
}

interface FetchNewsHeadlinesResult {
  headlineMap: Map<string, string[]>;
  oneLinerMap: Map<string, string>;
}

async function fetchNewsHeadlines(
  db: Pool,
  symbolFilter?: string,
): Promise<FetchNewsHeadlinesResult> {
  const params: unknown[] = [];
  let symbolClause = "";
  if (symbolFilter) {
    symbolClause = " AND affected_tickers && $1::text[]";
    params.push(newsLookupCandidateSymbols(symbolFilter));
  }

  const { rows } = await db.query<NewsHeadlineRow>(
    `SELECT theme AS headline, affected_tickers, news_one_liner
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')${symbolClause}
     ORDER BY relevance_score DESC
     LIMIT 50`,
    params,
  );

  const headlineMap = new Map<string, string[]>();
  const oneLinerMap = new Map<string, string>();
  for (const row of rows) {
    for (const ticker of row.affected_tickers ?? []) {
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

// ── Macro context ────────────────────────────────────────────────────

export interface MacroContext {
  headlines: string[];
  dominantTheme: string | null;
  overallSentiment: number;
}

export async function fetchMacroContext(db: Pool): Promise<MacroContext> {
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
     ORDER BY
       CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       relevance_score DESC
     LIMIT 10`,
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

  let dominantTheme: string | null = null;
  let maxCount = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantTheme = cat;
    }
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

function detectNewsSentimentSignals(
  newsRows: NewsSentimentRow[],
  headlineMap: Map<string, string[]>,
  assetType: "stock" | "crypto",
): TickerSignal[] {
  const signals: TickerSignal[] = [];

  for (const row of newsRows) {
    const avg = toNum(row.avg_sentiment);
    if (avg == null) continue;
    const count = Number(row.article_count);

    let direction: "bullish" | "bearish" | null = null;
    if (avg >= 0.3) direction = "bullish";
    else if (avg <= -0.3) direction = "bearish";
    if (!direction) continue;

    const headlines = headlineMap.get(row.symbol) ?? [];

    signals.push({
      symbol: row.symbol,
      assetType,
      type: "news_sentiment",
      priority: count >= 5 ? "high" : "medium",
      timeframeAlignment: "partial",
      headline: `${row.symbol} has ${direction} news sentiment (${count} articles, avg ${avg.toFixed(2)})`,
      rawData: {
        close: 0,
        daySignal: "neutral",
        swingSignal: "neutral",
        longTermSignal: "neutral",
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
}

export async function detectSignals(
  db: Pool,
  assetType: "stock" | "crypto",
): Promise<DetectSignalsResult> {
  const [targets, indicators, candles, macroContext] = await Promise.all([
    fetchPriceTargets(db, assetType),
    fetchIndicators(db, assetType),
    fetchCandlesticks(db, assetType),
    fetchMacroContext(db).catch(() => ({ headlines: [], dominantTheme: null, overallSentiment: 0 }) as MacroContext),
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
  const technicalSignals = contexts.flatMap(detectForTicker);

  const technicalSymbols = new Set(contexts.map((c) => c.symbol));
  const newsSignals = detectNewsSentimentSignals(newsRows, headlineMap, assetType)
    .filter((s) => technicalSymbols.has(s.symbol));

  return { signals: [...technicalSignals, ...newsSignals], macroContext, newsOneLinerMap: oneLinerMap };
}

export async function detectSignalsForTicker(
  db: Pool,
  symbol: string,
  assetType: "stock" | "crypto",
): Promise<DetectSignalsResult> {
  const [targets, indicators, candles, macroContext] = await Promise.all([
    fetchPriceTargets(db, assetType, symbol),
    fetchIndicators(db, assetType, symbol),
    fetchCandlesticks(db, assetType, symbol),
    fetchMacroContext(db).catch(() => ({ headlines: [], dominantTheme: null, overallSentiment: 0 }) as MacroContext),
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
  const technicalSignals = contexts.flatMap(detectForTicker);

  const technicalSymbols = new Set(contexts.map((c) => c.symbol));
  const newsSignals = detectNewsSentimentSignals(newsRows, headlineMap, assetType)
    .filter((s) => technicalSymbols.has(s.symbol));

  return { signals: [...technicalSignals, ...newsSignals], macroContext, newsOneLinerMap: oneLinerMap };
}
