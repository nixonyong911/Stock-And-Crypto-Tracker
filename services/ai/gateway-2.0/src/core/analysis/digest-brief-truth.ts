/**
 * Smart Digest — DB truth layer.
 *
 * Pure, side-effect-free stage that sits between `recommendation-engine.ts`
 * and `digest-brief-generator.ts`. It does not query the DB; it only
 * collects what the engine has already loaded into a structured truth
 * object so the brief generator can compose a card without inventing
 * facts or shadow-templating.
 *
 * Three explicit stages live in this file:
 *
 *   1. `gatherTruth(signal, macroContext, newsOneLinerMap)` -> `BriefTruth`
 *      Maps DB-loaded `TickerSignal.rawData` and the curated memory inputs
 *      onto a typed `BriefTruth`. Every field that lands in `BriefTruth`
 *      is grounded in a known DB column or `undefined` (omitted).
 *
 *   2. `deriveSignals(truth, signal)` -> `BriefDerived`
 *      Code-derived signals that combine truth fields (stance, confidence,
 *      level cascade results, has-material-context flag).
 *
 *   3. `composeBrief(truth, derived, mode)` is exported as the
 *      "interpretation seam" — currently a deterministic transform; a
 *      future LLM compressor can swap this single function out without
 *      touching upstream stages.
 *
 * Source-of-truth map (see plan):
 *
 *   - `analysis_ticker_price_targets.{latest_close, latest_open,
 *      entry_price_low, target_price, stop_loss, signal_summary,
 *      confidence, analysis_date, metadata.{ema_20, low_period,
 *      ema_50, high_period}}` -> `BriefTruth.price`, `levels`, `dataAsOf`
 *   - `analysis_indicators_{stock,crypto}_free.macd_histogram` ->
 *      `BriefTruth.signalFacts.macdHistogram`
 *   - `analysis_{stock,crypto}_candlestick_pattern.detected_patterns` ->
 *      `BriefTruth.signalFacts.pattern`
 *   - `analysis_market_memory.{news_one_liner, summary, key_facts,
 *      market_implications, impact_level, relevance_score, sentiment*,
 *      affected_tickers}` -> `BriefTruth.memoryText`,
 *      `signalFacts.news*`, `BriefTruth.contextSource`
 *   - `MacroContext.{dominantTheme, overallSentiment}` (already aggregated
 *      from `analysis_market_memory`) -> `BriefTruth.macro`
 *
 * Anything not in that mapping must NOT appear in `BriefTruth`.
 */

import type {
  TickerSignal,
  MacroContext,
  TickerMemoryText,
} from "./recommendation-engine.js";
import type { StatusTone } from "./card-renderer.js";
import { textMentionsAnyAlias } from "./digest-symbol-affinity.js";

// ── Public types ──────────────────────────────────────────────────────

export type BriefMode = "strict" | "blended";

export type { TickerMemoryText };

/**
 * Strictly-DB-grounded inputs to the brief generator. Every populated key
 * traces to a documented column. Missing data is `undefined`, never
 * fabricated.
 */
export interface BriefTruth {
  symbol: string;
  assetType: "stock" | "crypto";

  /** Latest close from `analysis_ticker_price_targets.latest_close`. */
  price?: number;
  /** Latest open from `analysis_ticker_price_targets.latest_open`. */
  open?: number;
  /** ISO date (YYYY-MM-DD) of the swing/long row that drove `price`. */
  dataAsOf?: string;

  /** Per-trader signal_summary values (day, swing, long_term). */
  signals: {
    day: "bullish" | "bearish" | "neutral";
    swing: "bullish" | "bearish" | "neutral";
    longTerm: "bullish" | "bearish" | "neutral";
    alignment: "full" | "partial" | "conflict";
  };

  /**
   * Levels DB-sourced from `analysis_ticker_price_targets`. Only set when
   * the corresponding column is non-null. Absence here means the renderer
   * should degrade to em-dash, never invent a number.
   */
  levels: {
    entryLow?: number;
    entryHigh?: number;
    target?: number;
    stopLoss?: number;
    periodLow?: number;
    periodHigh?: number;
    ema20?: number;
    ema50?: number;
  };

  /**
   * Raw confidence from `analysis_ticker_price_targets.confidence` (0-1).
   * Bucketing happens in `deriveSignals`.
   */
  rawConfidence?: number;

  /**
   * Facts that describe what the dominant signal means. Drawn directly
   * from `TickerSignal.rawData`, which the engine populated from DB rows.
   * No invented values.
   */
  signalFacts: {
    type: TickerSignal["type"];
    priority: TickerSignal["priority"];
    /** From `analysis_indicators_*.macd_histogram` (today). */
    macdHistogram?: number;
    /** Previous swing signal — from yesterday's `signal_summary`. */
    previousSignal?: "bullish" | "bearish" | "neutral";
    /** Today's swing signal — same source. */
    currentSignal?: "bullish" | "bearish" | "neutral";
    /** Top candlestick pattern from `analysis_*_candlestick_pattern`. */
    pattern?: { name: string; signal: string };
    /** Pattern confidence (0-1) from `detected_patterns[0].confidence`. */
    patternConfidence?: number;
    /** News sentiment — from aggregated `analysis_market_memory`. */
    newsSentimentLabel?: "bullish" | "bearish";
    newsArticleCount?: number;
    /**
     * Mean sentiment across the article window (-1..+1). Sourced from
     * `news_sentiment_history.avg_sentiment` via the engine. Used by the
     * B3 confidence derivation so we no longer rely on count alone.
     */
    newsAvgSentiment?: number;
  };

  /** Per-ticker curated text from `analysis_market_memory`. */
  memoryText?: TickerMemoryText;

  /** Macro aggregate from `fetchMacroContext` (memory category in/policy). */
  macro?: {
    dominantTheme: string;
    overallSentiment: number;
  };

  /**
   * Records cases where a DB-supplied number failed sanity checks and
   * was deliberately omitted from `BriefTruth`. Each entry is a stable
   * machine-readable code so downstream tools can surface the rejection
   * without re-deriving it. The presence of a flag is the only safe
   * breadcrumb back to an upstream data-quality regression — without
   * it, omitted fields look identical to never-populated fields.
   *
   * Codes currently emitted by `gatherTruth`:
   *   - "open_close_unit_mismatch"
   *   - "level_out_of_band:<field>"
   */
  truthFlags?: string[];

  /**
   * Optional alias context used by Step-5 surfacing scoring. When
   * present, `deriveContextFromTruth` evaluates the on-symbol-mention
   * signal against `news_one_liner` and combines it with impact /
   * relevance / freshness into a `surfacingScore`. Absence is
   * backward-compatible: surfacing falls back to floor-only behavior
   * (impact + relevance + freshness gates), identical to pre-Step-5.
   */
  aliasContext?: {
    symbolUpper: string;
    aliases: string[];
  };
}

/**
 * Derived/code-only signals built on top of `BriefTruth`. These are not
 * truth — they are interpretation layered on top of truth. Every value
 * here must trace to one or more `BriefTruth` fields.
 */
export interface BriefDerived {
  stance: { label: BriefStanceLabel; tone: StatusTone };
  confidence: "High" | "Medium" | "Low";
  /** Strings ready for `whatToWatch`; "—" when no qualifying truth. */
  holdAbove: string;
  breakBelowTarget: string;
  changePercent: number;
  hasMaterialContext: boolean;
  /** Resolved context line; `""` when no qualifying source. */
  context: string;
  /**
   * Identifies which DB source supplied the context line, for tests.
   *
   *   - "news_one_liner" — chosen memory row's `news_one_liner` cleared
   *     both the floor gate and the Step-5 surfacing threshold.
   *   - "macro" — per-symbol surfacing returned no, macro gate passed.
   *   - "omitted_low_score" — per-symbol memory cleared the floor gate
   *     but its Step-5 surfacing score landed below `SURFACING_MIN`,
   *     so context was deliberately omitted (preferred over weak text).
   *   - "none" — no candidate source qualified at any layer.
   */
  contextSource: "news_one_liner" | "macro" | "none" | "omitted_low_score";
  /** True when `context` was trimmed to fit the sentence-boundary cap. */
  contextTrimmed: boolean;
  /**
   * Per-signal strength in [0, 1], derived from current-state truth only.
   * Used as a tiebreak in `selectPrimary` and to rescue the
   * `degenerate_default` confidence path.
   */
  signalStrength: number;
  /**
   * Names the input that drove the `confidence` bucket so debug tools can
   * show why a card landed on Low/Medium/High. Sources:
   *   - "news_score": news_sentiment derived from `count * |avg|`.
   *   - "raw_confidence": `analysis_ticker_price_targets.confidence` was a
   *     non-degenerate value (i.e. not 1.0000) and clipped the bucket.
   *   - "alignment_only": no useful raw confidence; bucket fell out of
   *     `signals.alignment` (Low on conflict, Medium otherwise).
   *   - "degenerate_default": rawConfidence was the well-known 1.0000
   *     constant we observed in production and was deliberately ignored,
   *     and signal strength was too low to rescue.
   *   - "news_count_only": news_sentiment without `newsAvgSentiment` —
   *     fell back to count-based bucketing (legacy path).
   *   - "strength_from_signal": rawConfidence was degenerate (1.0000) but
   *     signal strength was high enough to rescue to a meaningful bucket.
   */
  confidenceSource:
    | "news_score"
    | "news_count_only"
    | "raw_confidence"
    | "alignment_only"
    | "degenerate_default"
    | "strength_from_signal";
}

export type BriefStanceLabel =
  | "Watch zone"
  | "Constructive"
  | "Caution"
  | "Neutral";

// ── Source-of-truth gates ─────────────────────────────────────────────

/**
 * Memory text is "material enough to surface" when the curator marked it
 * impactful and relevant. Below this gate the per-ticker one-liner should
 * not be treated as DB truth strong enough to dominate the card context.
 */
const MEMORY_IMPACT_GATE: ReadonlyArray<TickerMemoryText["impactLevel"]> = [
  "critical",
  "high",
  "medium",
];
const MEMORY_RELEVANCE_GATE = 0.5;

/** Only "high" or "critical" memory is allowed to enrich `whatHappening` in blended mode. */
const MEMORY_BLEND_IMPACT_GATE: ReadonlyArray<TickerMemoryText["impactLevel"]> =
  ["critical", "high"];

/**
 * Macro is only material when the aggregated sentiment is meaningfully signed.
 *
 * Exported so the debug inspection layer (`digest-debug.ts`) can surface this
 * threshold to reviewers without re-declaring the constant.
 */
export const MACRO_SENTIMENT_GATE = 0.3;

/**
 * Default freshness window for `analysis_market_memory` rows used as
 * Smart Digest context. Overridable per-process via the
 * `SMART_DIGEST_MEMORY_FRESHNESS_HOURS` env var. Both the SQL fetchers
 * (`fetchTickerMemoryText`, `fetchNewsHeadlines`) and the in-process
 * gate (`memoryPasses*Gate`) read this single helper so the same
 * threshold applies everywhere.
 */
const DEFAULT_MEMORY_FRESHNESS_HOURS = 72;
const MEMORY_FRESHNESS_HOURS_MIN = 1;
const MEMORY_FRESHNESS_HOURS_MAX = 720;

export function getMemoryFreshnessHours(): number {
  const raw = process.env["SMART_DIGEST_MEMORY_FRESHNESS_HOURS"];
  if (raw === undefined || raw === "") return DEFAULT_MEMORY_FRESHNESS_HOURS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_MEMORY_FRESHNESS_HOURS;
  return Math.min(
    MEMORY_FRESHNESS_HOURS_MAX,
    Math.max(MEMORY_FRESHNESS_HOURS_MIN, n),
  );
}

function memoryWithinFreshness(
  lastUpdatedIso: string | undefined,
  hours: number,
  now: Date = new Date(),
): boolean {
  if (!lastUpdatedIso) return false;
  const t = Date.parse(lastUpdatedIso);
  if (!Number.isFinite(t)) return false;
  const ageMs = now.getTime() - t;
  if (ageMs < 0) return true;
  return ageMs <= hours * 3_600_000;
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function isFinitePositive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

// ── Sanity guards ─────────────────────────────────────────────────────
//
// These defend the brief against corrupt upstream rows we have observed
// in production (e.g. GOLD with `latest_close=46.056` and
// `latest_open=4613.35`, AAPL stuck for days, levels in different units
// from price). They do NOT try to fix the upstream problem — they only
// ensure that obviously-bad numbers never reach the rendered card.

/**
 * Maximum `Math.abs(Math.log(close/open))` allowed before treating
 * `latestOpen` as a unit/source mismatch with `latest_close`. Anything
 * beyond ±2× of the close is rejected. Real intraday moves are far
 * inside this band.
 */
const PRICE_OPEN_SANE_LOG_RATIO = Math.log(2);

/**
 * Allowed `level / close` ratio for any DB-sourced level
 * (entry low/high, target, stop_loss, periodLow/High, ema20/50).
 * 0.05x..20x is wide enough to admit deep stops and far targets while
 * still rejecting cross-unit smears like a $4613 entry against a $46
 * close.
 */
const LEVEL_PRICE_BAND_LOW = 0.05;
const LEVEL_PRICE_BAND_HIGH = 20;

function priceOpenSane(close: number, open: number): boolean {
  if (!isFinitePositive(close) || !isFinitePositive(open)) return false;
  return Math.abs(Math.log(close / open)) < PRICE_OPEN_SANE_LOG_RATIO;
}

function levelInPriceBand(level: number, close: number): boolean {
  if (!isFinitePositive(level) || !isFinitePositive(close)) return false;
  const ratio = level / close;
  return ratio >= LEVEL_PRICE_BAND_LOW && ratio <= LEVEL_PRICE_BAND_HIGH;
}

function pushFlag(flags: string[], code: string): void {
  if (!flags.includes(code)) flags.push(code);
}

/**
 * Exported so the debug inspection layer can re-evaluate the same gate
 * against arbitrary memory rows and report `gates.contextGatePassed` per
 * candidate, in lock-step with production.
 */
export function memoryPassesContextGate(
  m: TickerMemoryText | undefined,
): boolean {
  if (!m) return false;
  if (!m.newsOneLiner || m.newsOneLiner.trim().length === 0) return false;
  if (!m.impactLevel || !MEMORY_IMPACT_GATE.includes(m.impactLevel))
    return false;
  if ((m.relevanceScore ?? 0) < MEMORY_RELEVANCE_GATE) return false;
  if (!memoryWithinFreshness(m.lastUpdated, getMemoryFreshnessHours()))
    return false;
  return true;
}

/** Exported for the debug inspection layer (mirror of context gate). */
export function memoryPassesBlendGate(
  m: TickerMemoryText | undefined,
): boolean {
  if (!m) return false;
  if (!m.summary || m.summary.trim().length === 0) return false;
  if (!m.impactLevel || !MEMORY_BLEND_IMPACT_GATE.includes(m.impactLevel))
    return false;
  if (!memoryWithinFreshness(m.lastUpdated, getMemoryFreshnessHours()))
    return false;
  return true;
}

/** Exported for the debug inspection layer (mirror of memory gates). */
export function macroPassesGate(
  macro: BriefTruth["macro"] | undefined,
): boolean {
  if (!macro) return false;
  if (!macro.dominantTheme || macro.dominantTheme.trim().length === 0)
    return false;
  return Math.abs(macro.overallSentiment) >= MACRO_SENTIMENT_GATE;
}

// ── Step-5 surfacing decision (separate from association ranking) ────
//
// `memoryPassesContextGate` above is the *floor*: a row must clear
// impact/relevance/freshness to even be considered. The Step-5 surfacing
// score is layered on top and decides whether a floor-passing row is
// strong enough to actually surface as the user-facing context line.
//
// Rationale: the floor catches obviously-disqualified rows but is
// uniform; it cannot distinguish a high-impact row whose one-liner
// names the symbol from a same-impact row whose one-liner is about a
// peer company. The surfacing score adds that distinction without
// hard-suppressing legitimate sector / supply-chain context (which
// would be gone if we made one-liner-on-symbol a hard gate).

/**
 * Component weights for the surfacing score. Sum to 1.0 by convention so
 * the score itself sits in [0, 1] and `SURFACING_MIN` is interpretable
 * as a fraction of the maximum.
 */
const SURFACING_W_IMPACT = 0.3;
const SURFACING_W_RELEVANCE = 0.2;
const SURFACING_W_FRESHNESS = 0.2;
const SURFACING_W_ONELINER = 0.3;

/** Threshold above which a floor-passing row surfaces as `news_one_liner`. */
const DEFAULT_SURFACING_MIN = 0.55;
const SURFACING_MIN_FLOOR = 0.0;
const SURFACING_MIN_CEILING = 1.0;

/**
 * Read the surfacing threshold from the environment. Mirrors the
 * `getMemoryFreshnessHours` / `getAffinityMin` pattern. Clamped so a
 * typo cannot let everything through (`-1`) or hard-suppress everything
 * (`2`).
 */
export function getSurfacingMin(): number {
  const raw = process.env["SMART_DIGEST_SURFACING_MIN"];
  if (raw === undefined || raw === "") return DEFAULT_SURFACING_MIN;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT_SURFACING_MIN;
  return Math.min(SURFACING_MIN_CEILING, Math.max(SURFACING_MIN_FLOOR, n));
}

function impactWeight(level: TickerMemoryText["impactLevel"] | undefined): number {
  switch (level) {
    case "critical":
      return 1.0;
    case "high":
      return 0.8;
    case "medium":
      return 0.5;
    case "low":
      return 0.2;
    default:
      return 0;
  }
}

function ageHoursOf(iso: string | undefined, now: Date = new Date()): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  const ms = now.getTime() - t;
  if (ms < 0) return 0;
  return ms / 3_600_000;
}

function linearFreshness(ageHours: number, halfLifeHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 1;
  if (!Number.isFinite(halfLifeHours) || halfLifeHours <= 0) return 0;
  const v = 1 - ageHours / halfLifeHours;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

export interface SurfacingScoreInputs {
  impactLevel: TickerMemoryText["impactLevel"] | undefined;
  relevanceScore: number | undefined;
  ageHours: number;
  halfLifeHours: number;
  oneLinerOnSymbol: boolean;
}

/**
 * Pure surfacing score. Bounded in [0, 1] so the threshold has a
 * natural interpretation. Exported for tests and the debug envelope.
 */
export function computeSurfacingScore(inp: SurfacingScoreInputs): number {
  const impact = impactWeight(inp.impactLevel);
  const relevance = Math.max(0, Math.min(1, inp.relevanceScore ?? 0));
  const freshness = linearFreshness(inp.ageHours, inp.halfLifeHours);
  const oneliner = inp.oneLinerOnSymbol ? 1 : 0;
  return (
    SURFACING_W_IMPACT * impact +
    SURFACING_W_RELEVANCE * relevance +
    SURFACING_W_FRESHNESS * freshness +
    SURFACING_W_ONELINER * oneliner
  );
}

export type SurfacingDecision =
  | "passed_floor_above_threshold"
  | "passed_floor_below_threshold"
  | "failed_floor"
  | "not_evaluated";

export interface SurfacingResult {
  /** Did the row clear the floor gate? */
  flooredPassed: boolean;
  /**
   * Surfacing score; `null` when the row failed the floor (we do not
   * pretend a number when the inputs were never combined).
   */
  surfacingScore: number | null;
  /** Threshold the score was compared against. Echoed for debug envelopes. */
  surfacingMin: number;
  /** True iff the row should actually surface as the context line. */
  shouldSurface: boolean;
  /** Stable code documenting which branch fired. */
  decision: SurfacingDecision;
  /** True iff the row's `news_one_liner` mentions any digest-symbol alias. */
  oneLinerOnSymbol: boolean;
}

/**
 * Compute the full surfacing decision for a single memory row against
 * a digest symbol.
 *
 * Two operating modes:
 *
 *   - **With `aliasContext`** (production after Step 5): floor + score
 *     + threshold. Floor-passing rows whose surfacing score lands below
 *     `SURFACING_MIN` are deliberately omitted with
 *     `passed_floor_below_threshold`.
 *   - **Without `aliasContext`** (legacy callers and tests that do not
 *     plumb aliases): floor-only behavior, identical to the pre-Step-5
 *     `memoryPassesContextGate` semantics. The score has no on-symbol
 *     signal to combine, so collapsing to the floor is the honest
 *     choice rather than scoring against an arbitrary baseline. The
 *     score itself is still computed and surfaced for inspectability.
 */
export function decideSurfacing(
  m: TickerMemoryText | undefined,
  aliasContext: BriefTruth["aliasContext"] | undefined,
): SurfacingResult {
  const surfacingMin = getSurfacingMin();
  if (!m) {
    return {
      flooredPassed: false,
      surfacingScore: null,
      surfacingMin,
      shouldSurface: false,
      decision: "not_evaluated",
      oneLinerOnSymbol: false,
    };
  }
  const flooredPassed = memoryPassesContextGate(m);
  if (!flooredPassed) {
    return {
      flooredPassed,
      surfacingScore: null,
      surfacingMin,
      shouldSurface: false,
      decision: "failed_floor",
      oneLinerOnSymbol: false,
    };
  }
  const halfLifeHours = getMemoryFreshnessHours();
  const ageHours = ageHoursOf(m.lastUpdated);
  const oneLinerOnSymbol = aliasContext
    ? textMentionsAnyAlias(m.newsOneLiner, aliasContext.aliases)
    : false;
  const surfacingScore = computeSurfacingScore({
    impactLevel: m.impactLevel,
    relevanceScore: m.relevanceScore,
    ageHours,
    halfLifeHours,
    oneLinerOnSymbol,
  });

  // Floor-only mode: no aliases plumbed through, so surface iff floor
  // passed. Score is informational only.
  if (!aliasContext) {
    return {
      flooredPassed,
      surfacingScore,
      surfacingMin,
      shouldSurface: true,
      decision: "passed_floor_above_threshold",
      oneLinerOnSymbol,
    };
  }

  if (surfacingScore >= surfacingMin) {
    return {
      flooredPassed,
      surfacingScore,
      surfacingMin,
      shouldSurface: true,
      decision: "passed_floor_above_threshold",
      oneLinerOnSymbol,
    };
  }
  return {
    flooredPassed,
    surfacingScore,
    surfacingMin,
    shouldSurface: false,
    decision: "passed_floor_below_threshold",
    oneLinerOnSymbol,
  };
}

function asTriDir(
  v: string | undefined,
): "bullish" | "bearish" | "neutral" {
  if (v === "bullish" || v === "bearish") return v;
  return "neutral";
}

// ── Stage 1: gatherTruth ──────────────────────────────────────────────

export interface GatherTruthArgs {
  signal: TickerSignal;
  macroContext?: MacroContext;
  /** Per-ticker memory text loaded by the engine (already keyed by symbol). */
  memoryText?: TickerMemoryText;
  /** ISO YYYY-MM-DD analysis date sourced from the swing/long-term row. */
  analysisDate?: string;
  /**
   * Optional alias context for the digest symbol. When supplied, the
   * downstream surfacing decision combines impact / relevance /
   * freshness with whether the memory row's `news_one_liner` actually
   * names any alias of the symbol. Omitted callers (legacy / tests
   * not plumbing aliases) get floor-only surfacing semantics.
   */
  aliasContext?: BriefTruth["aliasContext"];
}

/**
 * Map raw engine outputs onto a strictly DB-grounded `BriefTruth`.
 * Pure: no I/O, no time references, no hard-coded fallbacks.
 *
 * Numeric values that fail sanity guards (open/close ratio, level/price
 * band) are deliberately omitted and recorded in `truth.truthFlags`
 * rather than passed through to the renderer.
 */
export function gatherTruth(args: GatherTruthArgs): BriefTruth {
  const { signal, macroContext, memoryText, analysisDate, aliasContext } = args;
  const d = signal.rawData;
  const flags: string[] = [];

  const truth: BriefTruth = {
    symbol: signal.symbol,
    assetType: signal.assetType,
    signals: {
      day: asTriDir(d.daySignal),
      swing: asTriDir(d.swingSignal),
      longTerm: asTriDir(d.longTermSignal),
      alignment: signal.timeframeAlignment,
    },
    levels: {},
    signalFacts: {
      type: signal.type,
      priority: signal.priority,
    },
  };

  if (aliasContext && aliasContext.aliases.length > 0) {
    truth.aliasContext = {
      symbolUpper: aliasContext.symbolUpper,
      aliases: aliasContext.aliases,
    };
  }

  if (isFinitePositive(d.close)) truth.price = d.close;
  if (isFinitePositive(d.latestOpen)) {
    if (truth.price != null && !priceOpenSane(truth.price, d.latestOpen)) {
      pushFlag(flags, "open_close_unit_mismatch");
    } else {
      truth.open = d.latestOpen;
    }
  }
  if (analysisDate && analysisDate.length > 0) truth.dataAsOf = analysisDate;

  // Level guards. We only reject when truth.price exists; otherwise we
  // can't compare ratios and the level is the only number we have.
  const assignLevel = (
    field: keyof BriefTruth["levels"],
    raw: number | undefined,
  ): void => {
    if (!isFinitePositive(raw)) return;
    if (truth.price != null && !levelInPriceBand(raw, truth.price)) {
      pushFlag(flags, `level_out_of_band:${field}`);
      return;
    }
    truth.levels[field] = raw;
  };
  assignLevel("entryLow", d.entryLow);
  assignLevel("entryHigh", d.entryHigh);
  assignLevel("target", d.targetPrice);
  assignLevel("stopLoss", d.stopLoss);
  assignLevel("periodLow", d.periodLow);
  assignLevel("periodHigh", d.periodHigh);
  assignLevel("ema20", d.ema20);
  assignLevel("ema50", d.ema50);

  if (typeof d.confidence === "number" && Number.isFinite(d.confidence)) {
    truth.rawConfidence = d.confidence;
  }

  if (typeof d.macdHistogram === "number" && Number.isFinite(d.macdHistogram)) {
    truth.signalFacts.macdHistogram = d.macdHistogram;
  }
  if (d.previousSignal) {
    truth.signalFacts.previousSignal = asTriDir(d.previousSignal);
  }
  if (d.currentSignal) {
    truth.signalFacts.currentSignal = asTriDir(d.currentSignal);
  }
  if (d.patterns && d.patterns.length > 0) {
    const top = d.patterns[0]!;
    truth.signalFacts.pattern = { name: top.pattern, signal: top.signal };
    if (typeof top.confidence === "number" && Number.isFinite(top.confidence)) {
      truth.signalFacts.patternConfidence = top.confidence;
    }
  }
  if (
    d.newsSentimentLabel === "bullish" ||
    d.newsSentimentLabel === "bearish"
  ) {
    truth.signalFacts.newsSentimentLabel = d.newsSentimentLabel;
  }
  if (typeof d.newsArticleCount === "number" && d.newsArticleCount > 0) {
    truth.signalFacts.newsArticleCount = d.newsArticleCount;
  }
  if (
    typeof d.newsAvgSentiment === "number" &&
    Number.isFinite(d.newsAvgSentiment)
  ) {
    truth.signalFacts.newsAvgSentiment = d.newsAvgSentiment;
  }

  if (memoryText) {
    truth.memoryText = memoryText;
  }

  if (
    macroContext &&
    macroContext.dominantTheme &&
    Number.isFinite(macroContext.overallSentiment)
  ) {
    truth.macro = {
      dominantTheme: macroContext.dominantTheme,
      overallSentiment: macroContext.overallSentiment,
    };
  }

  if (flags.length > 0) truth.truthFlags = flags;

  return truth;
}

// ── Stage 2: deriveSignals ────────────────────────────────────────────

/**
 * Code-derived signals over `BriefTruth`. Each output here is a pure
 * function of `truth` — does not touch I/O and does not invent values.
 */
export function deriveSignals(truth: BriefTruth): BriefDerived {
  const stance = deriveStanceFromTruth(truth);
  const signalStrength = deriveStrengthFromTruth(truth);
  const { confidence, confidenceSource } = deriveConfidenceFromTruth(truth, signalStrength);
  const { holdAbove, breakBelowTarget } = deriveLevelsFromTruth(truth);
  const changePercent = deriveChangePercentFromTruth(truth);
  const { context, contextSource, contextTrimmed } = deriveContextFromTruth(truth);
  const hasMaterialContext = context !== "";

  return {
    stance,
    confidence,
    holdAbove,
    breakBelowTarget,
    changePercent,
    hasMaterialContext,
    context,
    contextSource,
    contextTrimmed,
    signalStrength,
    confidenceSource,
  };
}

/**
 * Per-signal strength in [0, 1], derived from current-state truth only.
 * No temporal claims — strength is a function of how far (in magnitude)
 * the price sits relative to the level/threshold that triggered the signal.
 *
 * Exported for tests and the debug inspection layer.
 */
export function deriveStrengthFromTruth(truth: BriefTruth): number {
  const facts = truth.signalFacts;
  const price = truth.price;
  const lvl = truth.levels;

  switch (facts.type) {
    case "target_reached": {
      if (!isFinitePositive(price) || !isFinitePositive(lvl.target)) return 0;
      return Math.min(1, Math.abs(price / lvl.target - 1) * 10);
    }
    case "stop_loss_warning": {
      if (!isFinitePositive(price) || !isFinitePositive(lvl.stopLoss)) return 0;
      return Math.min(1, Math.abs(price / lvl.stopLoss - 1) * 10);
    }
    case "entry_zone": {
      if (!isFinitePositive(price)) return 0;
      const lo = lvl.entryLow;
      const hi = lvl.entryHigh;
      if (isFinitePositive(lo) && isFinitePositive(hi)) {
        const mid = (lo + hi) / 2;
        const halfWidth = (hi - lo) / 2 || 1;
        return Math.max(0, Math.min(1, 1 - Math.abs(price - mid) / halfWidth));
      }
      return 0.5;
    }
    case "momentum_shift": {
      const hist = facts.macdHistogram;
      if (hist == null || !isFinitePositive(price)) return 0;
      return Math.min(1, Math.abs(hist) / (price * 0.005));
    }
    case "signal_change": {
      const prev = facts.previousSignal ?? "neutral";
      const curr = facts.currentSignal ?? truth.signals.swing;
      if (prev !== "neutral" && curr !== "neutral" && prev !== curr) return 1.0;
      if (prev !== "neutral" && curr !== "neutral") return 0.7;
      return 0.4;
    }
    case "notable_pattern": {
      return facts.patternConfidence ?? 0.5;
    }
    case "news_sentiment": {
      const count = facts.newsArticleCount ?? 0;
      const avg = facts.newsAvgSentiment;
      if (typeof avg === "number" && Number.isFinite(avg)) {
        return Math.min(1, (count * Math.abs(avg)) / 8);
      }
      return 0;
    }
    default:
      return 0;
  }
}

function deriveStanceFromTruth(
  truth: BriefTruth,
): BriefDerived["stance"] {
  if (truth.signals.alignment === "conflict") {
    return { label: "Caution", tone: "watch" };
  }

  switch (truth.signalFacts.type) {
    case "entry_zone":
    case "notable_pattern":
    case "news_sentiment":
      return { label: "Watch zone", tone: "watch" };

    case "stop_loss_warning":
      return { label: "Caution", tone: "watch" };

    case "target_reached":
      return { label: "Constructive", tone: "trigger" };

    case "signal_change": {
      const next =
        truth.signalFacts.currentSignal ?? truth.signals.swing;
      if (next === "bullish")
        return { label: "Constructive", tone: "trigger" };
      if (next === "bearish") return { label: "Caution", tone: "watch" };
      return { label: "Neutral", tone: "neutral" };
    }

    case "momentum_shift": {
      const hist = truth.signalFacts.macdHistogram;
      if (hist != null && hist > 0)
        return { label: "Constructive", tone: "trigger" };
      if (hist != null && hist < 0)
        return { label: "Caution", tone: "watch" };
      return { label: "Neutral", tone: "neutral" };
    }

    default:
      return { label: "Neutral", tone: "neutral" };
  }
}

/**
 * Production observation: `analysis_ticker_price_targets.confidence`
 * arrives as exactly `1.0000` for the overwhelming majority of rows, so
 * a strict-equals comparison against any value at or above this floor is
 * indistinguishable from "the engine has nothing useful to say." We
 * deliberately ignore those rows when bucketing confidence and surface
 * the rejection through `confidenceSource = "degenerate_default"` so
 * debug tools can correlate stale confidence with the upstream issue.
 */
const DEGENERATE_RAW_CONFIDENCE = 0.999;

/**
 * News-sentiment confidence threshold built from `count * |avg|`.
 *  - >= NEWS_HIGH_SCORE -> High (rare; both volume and conviction).
 *  - >= NEWS_MEDIUM_SCORE -> Medium.
 *  - otherwise -> Low.
 *
 * Tuned so 7 articles at avg 0.6 (the empirical "noteworthy" threshold)
 * lands in Medium and 7 articles at avg 1.0 lands in High.
 */
const NEWS_MEDIUM_SCORE = 4;
const NEWS_HIGH_SCORE = 6;

function deriveConfidenceFromTruth(truth: BriefTruth, signalStrength: number): {
  confidence: BriefDerived["confidence"];
  confidenceSource: BriefDerived["confidenceSource"];
} {
  if (truth.signalFacts.type === "news_sentiment") {
    const count = truth.signalFacts.newsArticleCount ?? 0;
    const avg = truth.signalFacts.newsAvgSentiment;
    if (typeof avg === "number" && Number.isFinite(avg)) {
      const score = count * Math.abs(avg);
      if (score >= NEWS_HIGH_SCORE) {
        return { confidence: "High", confidenceSource: "news_score" };
      }
      if (score >= NEWS_MEDIUM_SCORE) {
        return { confidence: "Medium", confidenceSource: "news_score" };
      }
      return { confidence: "Low", confidenceSource: "news_score" };
    }
    if (count >= 7) {
      return { confidence: "Medium", confidenceSource: "news_count_only" };
    }
    return { confidence: "Low", confidenceSource: "news_count_only" };
  }

  if (truth.signals.alignment === "conflict") {
    return { confidence: "Low", confidenceSource: "alignment_only" };
  }

  const conf = truth.rawConfidence;
  if (conf != null && conf >= DEGENERATE_RAW_CONFIDENCE) {
    if (signalStrength >= 0.6) {
      return { confidence: "High", confidenceSource: "strength_from_signal" };
    }
    if (signalStrength >= 0.3) {
      return { confidence: "Medium", confidenceSource: "strength_from_signal" };
    }
    return { confidence: "Medium", confidenceSource: "degenerate_default" };
  }
  if (conf != null && conf < 0.4) {
    return { confidence: "Low", confidenceSource: "raw_confidence" };
  }
  if (
    conf != null &&
    conf >= 0.7 &&
    truth.signals.alignment === "full"
  ) {
    return { confidence: "High", confidenceSource: "raw_confidence" };
  }
  if (conf != null) {
    return { confidence: "Medium", confidenceSource: "raw_confidence" };
  }
  return { confidence: "Medium", confidenceSource: "alignment_only" };
}

function deriveLevelsFromTruth(truth: BriefTruth): {
  holdAbove: string;
  breakBelowTarget: string;
} {
  if (!isFinitePositive(truth.price)) {
    return { holdAbove: "—", breakBelowTarget: "—" };
  }

  const lvl = truth.levels;
  const signalType = truth.signalFacts.type;

  let holdRaw: number | undefined;
  let breakRaw: number | undefined;

  switch (signalType) {
    case "target_reached":
      // Price has reached/exceeded the target; the broken target becomes
      // the new support floor, and the nearest level below it (entry top
      // or EMA-20) is the invalidation line.
      holdRaw = lvl.target ?? lvl.entryHigh ?? lvl.ema20;
      breakRaw = lvl.entryHigh ?? lvl.ema20 ?? lvl.stopLoss;
      break;

    case "stop_loss_warning":
      // Price is pressing the stop; hold the stop as the critical floor
      // and reference the structural low below it.
      holdRaw = lvl.stopLoss ?? lvl.entryLow ?? lvl.periodLow;
      breakRaw = lvl.periodLow ?? lvl.ema50;
      break;

    default:
      // entry_zone, signal_change, momentum_shift, notable_pattern, etc.
      holdRaw = lvl.entryLow ?? lvl.periodLow ?? lvl.ema20;
      breakRaw = lvl.stopLoss;
      break;
  }

  const holdAbove = isFinitePositive(holdRaw) ? fmtPrice(holdRaw) : "—";
  const breakBelowTarget = isFinitePositive(breakRaw) ? fmtPrice(breakRaw) : "—";

  return { holdAbove, breakBelowTarget };
}

function deriveChangePercentFromTruth(truth: BriefTruth): number {
  if (!isFinitePositive(truth.price)) return 0;
  if (!isFinitePositive(truth.open)) return 0;
  return ((truth.price - truth.open) / truth.open) * 100;
}

function deriveContextFromTruth(truth: BriefTruth): {
  context: string;
  contextSource: BriefDerived["contextSource"];
  contextTrimmed: boolean;
} {
  // Step 5: per-symbol surfacing decision is layered on top of the
  // floor gate. Three branches:
  //   1. Floor passed AND surfacing score >= threshold -> surface line.
  //   2. Floor passed AND surfacing score < threshold  -> deliberate
  //      omission with `omitted_low_score` so debug + tests can tell
  //      "weak row, omitted" apart from "no row at all".
  //   3. Floor failed -> fall through to macro / none, same as before.
  const surfacing = decideSurfacing(truth.memoryText, truth.aliasContext);
  if (surfacing.shouldSurface) {
    const raw = truth.memoryText!.newsOneLiner!.trim();
    const { text, trimmed } = trimContextLine(raw);
    return {
      context: text,
      contextSource: "news_one_liner",
      contextTrimmed: trimmed,
    };
  }
  if (surfacing.decision === "passed_floor_below_threshold") {
    return {
      context: "",
      contextSource: "omitted_low_score",
      contextTrimmed: false,
    };
  }

  // Macro fallback only when no per-symbol surfacing was possible at
  // all (floor failed or no memory). Macro never overrides a
  // deliberate `omitted_low_score` — that omission is intentional.
  if (macroPassesGate(truth.macro)) {
    const sentiment =
      truth.macro!.overallSentiment >= MACRO_SENTIMENT_GATE
        ? "supportive"
        : "cautious";
    const raw = `Broader ${truth.macro!.dominantTheme} backdrop is ${sentiment}.`;
    const { text, trimmed } = trimContextLine(raw);
    return { context: text, contextSource: "macro", contextTrimmed: trimmed };
  }

  return { context: "", contextSource: "none", contextTrimmed: false };
}

const CONTEXT_MAX_CHARS = 180;
const CONTEXT_HARD_CUT = 160;

/**
 * Trim a context line to fit within `CONTEXT_MAX_CHARS`, preferring a
 * sentence boundary (`.`, `!`, `?`). Falls back to a hard cut at
 * `CONTEXT_HARD_CUT` chars with `"…"` appended.
 *
 * Exported for unit tests and the debug inspection layer.
 */
export function trimContextLine(line: string): { text: string; trimmed: boolean } {
  if (line.length <= CONTEXT_MAX_CHARS) return { text: line, trimmed: false };
  let best = -1;
  for (let i = 0; i < CONTEXT_MAX_CHARS; i++) {
    if (line[i] === "." || line[i] === "!" || line[i] === "?") {
      best = i;
    }
  }
  if (best >= 0) {
    return { text: line.slice(0, best + 1), trimmed: true };
  }
  return { text: `${line.slice(0, CONTEXT_HARD_CUT)}…`, trimmed: true };
}

// ── Stage 3: composeBrief (interpretation seam) ───────────────────────

export interface ComposeBriefArgs {
  truth: BriefTruth;
  derived: BriefDerived;
  /** strict (default): no memory text. blended: may append memory phrase. */
  mode?: BriefMode;
  /**
   * Test/scripted override. When omitted, `updatedAt` is derived from
   * `truth.dataAsOf` only; if that is also missing, `updatedAt` is
   * `null` and the renderer shows `"data unavailable"`. Wall-clock
   * fallback was deliberately removed to keep the footer truth-only.
   */
  now?: Date;
}

/**
 * The interpretation seam. Today this is a deterministic transform that
 * shapes `whatHappening` and `updatedAt` from `truth + derived`. A future
 * LLM compressor can replace this body without affecting upstream stages.
 *
 * Contract:
 *   - reads only `truth`, `derived`, `mode`, `now`
 *   - never invents facts or numbers
 *   - degrades to safe defaults when truth is sparse
 *   - `updatedAt` is `null` when no source-derived timestamp exists
 */
export function composeBrief(args: ComposeBriefArgs): {
  whatHappening: string;
  updatedAt: Date | null;
} {
  const { truth, derived, mode = "strict" } = args;
  const updatedAt = resolveUpdatedAt(truth, args.now);
  const whatHappening = buildWhatHappeningSentence(truth, derived, mode);
  return { whatHappening, updatedAt };
}

function resolveUpdatedAt(truth: BriefTruth, override?: Date): Date | null {
  if (override) return override;
  if (truth.dataAsOf) {
    // YYYY-MM-DD from `analysis_ticker_price_targets.analysis_date`. Treat
    // it as midnight America/New_York (the same TZ the renderer formats
    // in) so the card footer reflects the trading day, not a UTC drift.
    const parsed = parseAnalysisDateAsEt(truth.dataAsOf);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Parse a YYYY-MM-DD string as midnight America/New_York. We do not
 * import a tz library — instead we anchor on a fixed UTC offset for ET
 * (-04:00 during DST, -05:00 otherwise). Because `analysis_date` always
 * represents the close of a US session day, this is unambiguous as long
 * as we settle to a consistent end-of-day moment. To avoid DST guessing,
 * we use 21:00 UTC on that calendar day, which lands on the late-session
 * timestamp the renderer's `formatUpdatedAt` will localise back to ET.
 */
function parseAnalysisDateAsEt(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d))
    return null;
  // 21:00 UTC == 16:00 ET (DST) / 17:00 ET (standard). Both round to the
  // same calendar day in the renderer.
  const dt = new Date(Date.UTC(y, mo - 1, d, 21, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function buildWhatHappeningSentence(
  truth: BriefTruth,
  derived: BriefDerived,
  mode: BriefMode,
): string {
  const base = baseSignalSentence(truth, derived);
  if (mode === "strict") return base;
  const blend = blendedMemoryPhrase(truth);
  if (!blend) return base;
  const trimmedBase = base.endsWith(".") ? base : `${base}.`;
  return `${trimmedBase} ${blend}`;
}

/**
 * Builds the per-signal "what happening" sentence in strict mode.
 *
 * Every clause must trace back to a `BriefTruth` field — no invention,
 * no LLM, no hard-coded numbers. When a fact is missing the clause is
 * dropped rather than substituted with a placeholder. The result is a
 * deterministic line that calls out the actual numeric DB truth instead
 * of the stale generic templates the previous version emitted (e.g.
 * "AAPL has pulled back into its prior breakout zone").
 */
function baseSignalSentence(truth: BriefTruth, derived: BriefDerived): string {
  const sym = displaySymbol(truth.symbol);
  const facts = truth.signalFacts;
  const price = truth.price;
  const lvl = truth.levels;

  switch (facts.type) {
    case "entry_zone": {
      const parts: string[] = [];
      if (isFinitePositive(price)) {
        parts.push(`${sym} is back inside its entry zone at $${fmtPrice(price)}`);
      } else {
        parts.push(`${sym} is back inside its entry zone`);
      }
      const range = formatLevelRange(lvl.entryLow, lvl.entryHigh);
      if (range) parts.push(`(zone ${range})`);
      const stop = lvl.stopLoss;
      if (isFinitePositive(stop)) {
        parts.push(`with a stop at $${fmtPrice(stop)}`);
      }
      return `${parts.join(" ")}.`;
    }

    case "target_reached": {
      const tgt = lvl.target;
      if (isFinitePositive(price) && isFinitePositive(tgt)) {
        const gap = price / tgt - 1;
        if (gap > 0.03) {
          const pct = (gap * 100).toFixed(1);
          return `${sym} is trading at $${fmtPrice(price)}, ~${pct}% above its projected target of $${fmtPrice(tgt)}.`;
        }
        return `${sym} pushed to $${fmtPrice(price)}, into the projected target at $${fmtPrice(tgt)}.`;
      }
      if (isFinitePositive(price)) {
        return `${sym} pushed to $${fmtPrice(price)} into projected resistance.`;
      }
      return `${sym} pushed into its projected target zone.`;
    }

    case "stop_loss_warning": {
      const stop = lvl.stopLoss;
      const lo = lvl.periodLow;
      if (isFinitePositive(price) && isFinitePositive(stop)) {
        const gap = 1 - price / stop;
        if (gap > 0.03) {
          const pct = (gap * 100).toFixed(1);
          return `${sym} is trading at $${fmtPrice(price)}, ~${pct}% below its stop level at $${fmtPrice(stop)}.`;
        }
        return `${sym} is at $${fmtPrice(price)}, pressing the stop-loss at $${fmtPrice(stop)}.`;
      }
      if (isFinitePositive(price) && isFinitePositive(lo)) {
        return `${sym} is at $${fmtPrice(price)}, testing the lower edge near $${fmtPrice(lo)}.`;
      }
      return `${sym} is testing the lower edge of its recent range.`;
    }

    case "signal_change": {
      const prev = facts.previousSignal ?? "neutral";
      const curr = facts.currentSignal ?? truth.signals.swing;
      const priceClause = isFinitePositive(price)
        ? ` (last $${fmtPrice(price)})`
        : "";
      return `Trend on the swing timeframe flipped from ${prev} to ${curr}${priceClause}.`;
    }

    case "momentum_shift": {
      const hist = facts.macdHistogram;
      if (hist != null && Number.isFinite(hist)) {
        const dir = hist > 0 ? "positive" : "negative";
        return `Short-term momentum has rolled ${dir} (MACD histogram ${hist.toFixed(4)}).`;
      }
      return `Short-term momentum has shifted on this name.`;
    }

    case "notable_pattern": {
      const p = facts.pattern;
      if (!p) return `${sym} formed a notable candlestick pattern today.`;
      const pretty = capitalize(p.name.replace(/_/g, " "));
      const conf = derived.confidence; // High/Medium/Low — bucketed in deriveSignals
      return `${pretty} pattern formed today (${conf.toLowerCase()}-confidence), often a ${p.signal} reversal cue.`;
    }

    case "news_sentiment": {
      const label = facts.newsSentimentLabel ?? "mixed";
      const count = facts.newsArticleCount ?? 0;
      const avg = facts.newsAvgSentiment;
      const noun = count === 1 ? "story" : "stories";
      const newsStrength = deriveNewsStrength(count, avg);
      const prefix = newsStrength < 0.3 ? "Limited: " : "";
      if (typeof avg === "number" && Number.isFinite(avg)) {
        const sign = avg >= 0 ? "+" : "";
        return `${prefix}Recent coverage skewed ${label} across ${count} ${noun} (avg ${sign}${avg.toFixed(2)}).`;
      }
      return `${prefix}Recent coverage skewed ${label} across ${count} ${noun}.`;
    }

    default: {
      if (isFinitePositive(price)) {
        return `${sym} is trading at $${fmtPrice(price)}.`;
      }
      return `No actionable technical signals right now.`;
    }
  }
}

function formatLevelRange(
  low: number | undefined,
  high: number | undefined,
): string | null {
  if (isFinitePositive(low) && isFinitePositive(high)) {
    return `$${fmtPrice(low)}–$${fmtPrice(high)}`;
  }
  if (isFinitePositive(low)) return `from $${fmtPrice(low)}`;
  if (isFinitePositive(high)) return `up to $${fmtPrice(high)}`;
  return null;
}

function blendedMemoryPhrase(truth: BriefTruth): string | null {
  const m = truth.memoryText;
  if (!memoryPassesBlendGate(m)) return null;
  // Use `summary` (curator-written, not user-facing news_one_liner) and
  // truncate to a single short clause. We do not invent — only quote.
  const summary = m!.summary!.trim();
  if (summary.length === 0) return null;
  // Take first sentence, max ~140 chars. No ellipsis if it ends a sentence.
  const firstStop = summary.search(/[.!?](\s|$)/);
  let phrase =
    firstStop >= 0 ? summary.slice(0, firstStop + 1) : summary.slice(0, 140);
  phrase = phrase.trim();
  if (phrase.length === 0) return null;
  if (!/[.!?]$/.test(phrase)) phrase = `${phrase}.`;
  return phrase;
}

function deriveNewsStrength(count: number, avg: number | undefined): number {
  if (typeof avg === "number" && Number.isFinite(avg)) {
    return Math.min(1, (count * Math.abs(avg)) / 8);
  }
  return 0;
}

function displaySymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash !== -1 ? symbol.slice(0, slash) : symbol;
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
