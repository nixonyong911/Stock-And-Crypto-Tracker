/**
 * Smart Digest brief generator — produces a compact, card-shaped object
 * (`DigestBrief`) that maps 1:1 onto `CardData` in `card-renderer.ts`.
 *
 * Template-first and fully deterministic. No LLM call. Each field has a
 * concrete derivation rule; missing inputs fall through to safe defaults.
 *
 * Replaces the old long-form `explanation-generator.ts` for the digest
 * pipeline. The legacy module remains on disk but is no longer imported
 * by the digest flow.
 */

import type { TickerSignal, MacroContext } from "./recommendation-engine.js";
import type { CardData, StatusTone } from "./card-renderer.js";

// ── Public types ──────────────────────────────────────────────────────

export type DigestStanceLabel =
  | "Watch zone"
  | "Constructive"
  | "Caution"
  | "Neutral";

export type DigestStanceTone = StatusTone;

export interface DigestBrief {
  ticker: string;
  status: { label: DigestStanceLabel; tone: DigestStanceTone };
  price: number;
  changePercent: number;
  confidence: "High" | "Medium" | "Low";
  updatedAt: Date;
  whatHappening: string;
  whatToWatch: { holdAbove: string; breakBelowTarget: string };
  context: string;
  hasMaterialContext: boolean;
}

// Compile-time check that DigestBrief is a structural superset of CardData.
// If the renderer's CardData ever changes, this will fail at type-check.
const _briefMatchesCardData: (b: DigestBrief) => CardData = (b) => b;
void _briefMatchesCardData;

// ── Helpers ───────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<TickerSignal["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function selectPrimary(signals: TickerSignal[]): TickerSignal | undefined {
  if (signals.length === 0) return undefined;
  return [...signals].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  )[0];
}

function displaySymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash !== -1 ? symbol.slice(0, slash) : symbol;
}

function fmtPrice(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Stance ────────────────────────────────────────────────────────────

/**
 * Map signal type + alignment + direction to a small, stable stance vocab.
 * Renderer tones are constrained to `watch | trigger | neutral`.
 */
export function deriveStance(s: TickerSignal): {
  label: DigestStanceLabel;
  tone: DigestStanceTone;
} {
  const alignment = s.timeframeAlignment;
  const swing = s.rawData.swingSignal;

  if (alignment === "conflict") {
    return { label: "Caution", tone: "watch" };
  }

  switch (s.type) {
    case "entry_zone":
    case "notable_pattern":
    case "news_sentiment":
      return { label: "Watch zone", tone: "watch" };

    case "stop_loss_warning":
      return { label: "Caution", tone: "watch" };

    case "target_reached":
      return { label: "Constructive", tone: "trigger" };

    case "signal_change": {
      const next = s.rawData.currentSignal ?? swing;
      if (next === "bullish") return { label: "Constructive", tone: "trigger" };
      if (next === "bearish") return { label: "Caution", tone: "watch" };
      return { label: "Neutral", tone: "neutral" };
    }

    case "momentum_shift": {
      const hist = s.rawData.macdHistogram;
      if (hist != null && hist > 0) return { label: "Constructive", tone: "trigger" };
      if (hist != null && hist < 0) return { label: "Caution", tone: "watch" };
      return { label: "Neutral", tone: "neutral" };
    }

    default:
      return { label: "Neutral", tone: "neutral" };
  }
}

// ── Confidence ────────────────────────────────────────────────────────

/** Three-bucket confidence (High / Medium / Low). */
export function deriveConfidence(s: TickerSignal): DigestBrief["confidence"] {
  if (s.type === "news_sentiment") {
    const count = s.rawData.newsArticleCount ?? 0;
    if (count >= 7) return "Medium";
    return "Low";
  }

  if (s.timeframeAlignment === "conflict") return "Low";

  const conf = s.rawData.confidence;
  if (conf != null && conf < 0.4) return "Low";
  if (conf != null && conf >= 0.7 && s.timeframeAlignment === "full") return "High";
  return "Medium";
}

// ── What's happening ──────────────────────────────────────────────────

/** One short, plain-English sentence keyed off the dominant signal. */
export function buildWhatHappening(s: TickerSignal): string {
  const sym = displaySymbol(s.symbol);
  const d = s.rawData;

  switch (s.type) {
    case "entry_zone":
      return `${sym} has pulled back into its prior breakout zone with buyers stepping in at recent lows.`;

    case "target_reached":
      return `${sym} is pushing into projected resistance as buyers stay engaged.`;

    case "stop_loss_warning":
      return `${sym} is testing the lower edge of its recent range.`;

    case "signal_change": {
      const prev = d.previousSignal ?? "neutral";
      const curr = d.currentSignal ?? d.swingSignal;
      return `Trend has flipped from ${prev} to ${curr} on the swing timeframe.`;
    }

    case "momentum_shift": {
      const hist = d.macdHistogram;
      const dir = hist != null && hist > 0 ? "positive" : "negative";
      return `Short-term momentum has rolled ${dir}.`;
    }

    case "notable_pattern": {
      const p = d.patterns?.[0];
      if (!p) return `${sym} formed a notable candlestick pattern today.`;
      const pretty = p.pattern.replace(/_/g, " ");
      return `${capitalize(pretty)} pattern formed today, often a ${p.signal} reversal cue.`;
    }

    case "news_sentiment": {
      const label = d.newsSentimentLabel ?? "mixed";
      const count = d.newsArticleCount ?? 0;
      return `Recent coverage has skewed ${label} across ${count} ${count === 1 ? "story" : "stories"}.`;
    }

    default:
      return `${sym} is trading at $${fmtPrice(d.close)}.`;
  }
}

// ── What to watch ─────────────────────────────────────────────────────

/**
 * Derive two anchor levels for the renderer's "What to watch" block.
 * `holdAbove`         entryLow → periodLow → ema20 → close
 * `breakBelowTarget`  stopLoss → periodLow * 0.97 → entryLow * 0.97 → close * 0.97
 */
export function buildWhatToWatch(s: TickerSignal): {
  holdAbove: string;
  breakBelowTarget: string;
} {
  const d = s.rawData;
  const close = d.close;

  const holdRaw =
    d.entryLow ?? d.periodLow ?? d.ema20 ?? close;

  const breakRaw =
    d.stopLoss ??
    (d.periodLow != null ? d.periodLow * 0.97 : undefined) ??
    (d.entryLow != null ? d.entryLow * 0.97 : undefined) ??
    close * 0.97;

  return {
    holdAbove: fmtPrice(holdRaw),
    breakBelowTarget: fmtPrice(breakRaw),
  };
}

// ── Context (optional) ────────────────────────────────────────────────

/**
 * Optional one-liner. Returns `{ context: "", hasMaterialContext: false }`
 * when nothing material is available — `context: ""` is permitted by the
 * renderer.
 *
 * Priority: per-ticker news one-liner → strong macro theme → none.
 */
export function buildContext(
  s: TickerSignal,
  macroContext: MacroContext | undefined,
  newsOneLiner: string | undefined,
): { context: string; hasMaterialContext: boolean } {
  if (newsOneLiner && newsOneLiner.trim().length > 0) {
    return { context: newsOneLiner.trim(), hasMaterialContext: true };
  }

  if (
    macroContext &&
    macroContext.dominantTheme &&
    Math.abs(macroContext.overallSentiment) >= 0.2
  ) {
    const sentiment =
      macroContext.overallSentiment >= 0.2 ? "supportive" : "cautious";
    return {
      context: `Broader ${macroContext.dominantTheme} backdrop is ${sentiment}.`,
      hasMaterialContext: true,
    };
  }

  // Fallback when an `s` is provided but no material context is available.
  void s;
  return { context: "", hasMaterialContext: false };
}

// ── Public entry point ────────────────────────────────────────────────

export interface GenerateDigestBriefArgs {
  signals: TickerSignal[];
  symbol: string;
  macroContext?: MacroContext;
  newsOneLinerMap?: Map<string, string>;
  now?: Date;
}

/**
 * Build a `DigestBrief` for a single ticker. Always returns a valid object
 * — even when `signals` is empty (Neutral / safe defaults).
 *
 * Throws are not used; missing inputs collapse to safe defaults so the
 * digest pipeline cannot be derailed by sparse data.
 */
export function generateDigestBrief(args: GenerateDigestBriefArgs): DigestBrief {
  const { signals, symbol, macroContext, newsOneLinerMap, now } = args;
  const ticker = displaySymbol(symbol);
  const updatedAt = now ?? new Date();

  const primary = selectPrimary(signals);

  if (!primary) {
    return {
      ticker,
      status: { label: "Neutral", tone: "neutral" },
      price: 0,
      changePercent: 0,
      confidence: "Low",
      updatedAt,
      whatHappening: "No actionable technical signals right now.",
      whatToWatch: { holdAbove: "—", breakBelowTarget: "—" },
      context: "",
      hasMaterialContext: false,
    };
  }

  const d = primary.rawData;
  const close = d.close;
  const open = d.latestOpen;
  const changePercent =
    open != null && open > 0 ? ((close - open) / open) * 100 : 0;

  const newsOneLiner =
    primary.type === "news_sentiment"
      ? undefined
      : newsOneLinerMap?.get(symbol.toUpperCase());

  const ctx = buildContext(primary, macroContext, newsOneLiner);

  return {
    ticker,
    status: deriveStance(primary),
    price: close,
    changePercent,
    confidence: deriveConfidence(primary),
    updatedAt,
    whatHappening: buildWhatHappening(primary),
    whatToWatch: buildWhatToWatch(primary),
    context: ctx.context,
    hasMaterialContext: ctx.hasMaterialContext,
  };
}
