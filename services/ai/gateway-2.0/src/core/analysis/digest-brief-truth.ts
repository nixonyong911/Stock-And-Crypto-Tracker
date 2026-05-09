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
    /** News sentiment — from aggregated `analysis_market_memory`. */
    newsSentimentLabel?: "bullish" | "bearish";
    newsArticleCount?: number;
  };

  /** Per-ticker curated text from `analysis_market_memory`. */
  memoryText?: TickerMemoryText;

  /** Macro aggregate from `fetchMacroContext` (memory category in/policy). */
  macro?: {
    dominantTheme: string;
    overallSentiment: number;
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
  /** Identifies which DB source supplied the context line, for tests. */
  contextSource: "news_one_liner" | "macro" | "none";
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

/** Macro is only material when the aggregated sentiment is meaningfully signed. */
const MACRO_SENTIMENT_GATE = 0.3;

// ── Helpers ───────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function isFinitePositive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function memoryPassesContextGate(m: TickerMemoryText | undefined): boolean {
  if (!m) return false;
  if (!m.newsOneLiner || m.newsOneLiner.trim().length === 0) return false;
  if (!m.impactLevel || !MEMORY_IMPACT_GATE.includes(m.impactLevel))
    return false;
  if ((m.relevanceScore ?? 0) < MEMORY_RELEVANCE_GATE) return false;
  return true;
}

function memoryPassesBlendGate(m: TickerMemoryText | undefined): boolean {
  if (!m) return false;
  if (!m.summary || m.summary.trim().length === 0) return false;
  if (!m.impactLevel || !MEMORY_BLEND_IMPACT_GATE.includes(m.impactLevel))
    return false;
  return true;
}

function macroPassesGate(macro: BriefTruth["macro"] | undefined): boolean {
  if (!macro) return false;
  if (!macro.dominantTheme || macro.dominantTheme.trim().length === 0)
    return false;
  return Math.abs(macro.overallSentiment) >= MACRO_SENTIMENT_GATE;
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
}

/**
 * Map raw engine outputs onto a strictly DB-grounded `BriefTruth`.
 * Pure: no I/O, no time references, no hard-coded fallbacks.
 */
export function gatherTruth(args: GatherTruthArgs): BriefTruth {
  const { signal, macroContext, memoryText, analysisDate } = args;
  const d = signal.rawData;

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

  if (isFinitePositive(d.close)) truth.price = d.close;
  if (isFinitePositive(d.latestOpen)) truth.open = d.latestOpen;
  if (analysisDate && analysisDate.length > 0) truth.dataAsOf = analysisDate;

  if (isFinitePositive(d.entryLow)) truth.levels.entryLow = d.entryLow;
  if (isFinitePositive(d.entryHigh)) truth.levels.entryHigh = d.entryHigh;
  if (isFinitePositive(d.targetPrice)) truth.levels.target = d.targetPrice;
  if (isFinitePositive(d.stopLoss)) truth.levels.stopLoss = d.stopLoss;
  if (isFinitePositive(d.periodLow)) truth.levels.periodLow = d.periodLow;
  if (isFinitePositive(d.periodHigh)) truth.levels.periodHigh = d.periodHigh;
  if (isFinitePositive(d.ema20)) truth.levels.ema20 = d.ema20;
  if (isFinitePositive(d.ema50)) truth.levels.ema50 = d.ema50;

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

  return truth;
}

// ── Stage 2: deriveSignals ────────────────────────────────────────────

/**
 * Code-derived signals over `BriefTruth`. Each output here is a pure
 * function of `truth` — does not touch I/O and does not invent values.
 */
export function deriveSignals(truth: BriefTruth): BriefDerived {
  const stance = deriveStanceFromTruth(truth);
  const confidence = deriveConfidenceFromTruth(truth);
  const { holdAbove, breakBelowTarget } = deriveLevelsFromTruth(truth);
  const changePercent = deriveChangePercentFromTruth(truth);
  const { context, contextSource } = deriveContextFromTruth(truth);
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
  };
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

function deriveConfidenceFromTruth(
  truth: BriefTruth,
): BriefDerived["confidence"] {
  if (truth.signalFacts.type === "news_sentiment") {
    const count = truth.signalFacts.newsArticleCount ?? 0;
    if (count >= 7) return "Medium";
    return "Low";
  }

  if (truth.signals.alignment === "conflict") return "Low";

  const conf = truth.rawConfidence;
  if (conf != null && conf < 0.4) return "Low";
  if (
    conf != null &&
    conf >= 0.7 &&
    truth.signals.alignment === "full"
  ) {
    return "High";
  }
  return "Medium";
}

function deriveLevelsFromTruth(truth: BriefTruth): {
  holdAbove: string;
  breakBelowTarget: string;
} {
  // No truth at all (price guard upstream) -> em-dash on both ends.
  if (!isFinitePositive(truth.price)) {
    return { holdAbove: "—", breakBelowTarget: "—" };
  }

  // holdAbove cascade: entry_price_low -> metadata.low_period -> metadata.ema_20.
  // Deliberately drops the legacy `close` fallback: close is the price, not a level.
  const holdRaw =
    truth.levels.entryLow ?? truth.levels.periodLow ?? truth.levels.ema20;
  const holdAbove = isFinitePositive(holdRaw) ? fmtPrice(holdRaw) : "—";

  // breakBelowTarget: stop_loss only. No `* 0.97` invention.
  const breakRaw = truth.levels.stopLoss;
  const breakBelowTarget = isFinitePositive(breakRaw)
    ? fmtPrice(breakRaw)
    : "—";

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
} {
  if (memoryPassesContextGate(truth.memoryText)) {
    const line = truth.memoryText!.newsOneLiner!.trim();
    return { context: line, contextSource: "news_one_liner" };
  }

  if (macroPassesGate(truth.macro)) {
    const sentiment =
      truth.macro!.overallSentiment >= MACRO_SENTIMENT_GATE
        ? "supportive"
        : "cautious";
    return {
      context: `Broader ${truth.macro!.dominantTheme} backdrop is ${sentiment}.`,
      contextSource: "macro",
    };
  }

  return { context: "", contextSource: "none" };
}

// ── Stage 3: composeBrief (interpretation seam) ───────────────────────

export interface ComposeBriefArgs {
  truth: BriefTruth;
  derived: BriefDerived;
  /** strict (default): no memory text. blended: may append memory phrase. */
  mode?: BriefMode;
  /** Test/scripted override. Defaults to `truth.dataAsOf` then wall clock. */
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
 */
export function composeBrief(args: ComposeBriefArgs): {
  whatHappening: string;
  updatedAt: Date;
} {
  const { truth, derived, mode = "strict" } = args;
  const updatedAt = resolveUpdatedAt(truth, args.now);
  const whatHappening = buildWhatHappeningSentence(truth, derived, mode);
  return { whatHappening, updatedAt };
}

function resolveUpdatedAt(truth: BriefTruth, override?: Date): Date {
  if (override) return override;
  if (truth.dataAsOf) {
    // YYYY-MM-DD from `analysis_ticker_price_targets.analysis_date`. Treat
    // it as midnight America/New_York (the same TZ the renderer formats
    // in) so the card footer reflects the trading day, not a UTC drift.
    const parsed = parseAnalysisDateAsEt(truth.dataAsOf);
    if (parsed) return parsed;
  }
  return new Date();
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
  void derived;
  const base = baseSignalSentence(truth);
  if (mode === "strict") return base;
  const blend = blendedMemoryPhrase(truth);
  if (!blend) return base;
  const trimmedBase = base.endsWith(".") ? base : `${base}.`;
  return `${trimmedBase} ${blend}`;
}

function baseSignalSentence(truth: BriefTruth): string {
  const sym = displaySymbol(truth.symbol);
  const facts = truth.signalFacts;

  switch (facts.type) {
    case "entry_zone":
      return `${sym} has pulled back into its prior breakout zone with buyers stepping in at recent lows.`;

    case "target_reached":
      return `${sym} is pushing into projected resistance as buyers stay engaged.`;

    case "stop_loss_warning":
      return `${sym} is testing the lower edge of its recent range.`;

    case "signal_change": {
      const prev = facts.previousSignal ?? "neutral";
      const curr = facts.currentSignal ?? truth.signals.swing;
      return `Trend has flipped from ${prev} to ${curr} on the swing timeframe.`;
    }

    case "momentum_shift": {
      const hist = facts.macdHistogram;
      const dir = hist != null && hist > 0 ? "positive" : "negative";
      return `Short-term momentum has rolled ${dir}.`;
    }

    case "notable_pattern": {
      const p = facts.pattern;
      if (!p) return `${sym} formed a notable candlestick pattern today.`;
      const pretty = p.name.replace(/_/g, " ");
      return `${capitalize(pretty)} pattern formed today, often a ${p.signal} reversal cue.`;
    }

    case "news_sentiment": {
      const label = facts.newsSentimentLabel ?? "mixed";
      const count = facts.newsArticleCount ?? 0;
      return `Recent coverage has skewed ${label} across ${count} ${count === 1 ? "story" : "stories"}.`;
    }

    default: {
      if (isFinitePositive(truth.price)) {
        return `${sym} is trading at $${fmtPrice(truth.price)}.`;
      }
      return `No actionable technical signals right now.`;
    }
  }
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

function displaySymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash !== -1 ? symbol.slice(0, slash) : symbol;
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
