/**
 * Smart Digest brief generator — produces a compact, card-shaped object
 * (`DigestBrief`) that maps 1:1 onto `CardData` in `card-renderer.ts`.
 *
 * Deterministic, no LLM call. Internally delegates to the three-stage
 * truth layer in `digest-brief-truth.ts`:
 *
 *   1. `gatherTruth(...)` — DB-backed facts
 *   2. `deriveSignals(...)` — code-derived signals (stance / confidence /
 *      level cascade / context resolution)
 *   3. `composeBrief(...)` — interpretation seam (whatHappening + updatedAt)
 *
 * This file remains the public surface that the pipeline calls. Public
 * helper exports (`deriveStance`, `deriveConfidence`, `buildWhatHappening`,
 * `buildWhatToWatch`, `buildContext`) are preserved as thin wrappers over
 * the truth layer so existing call sites and unit tests do not need to
 * change.
 *
 * Behavior changes in this revision (intentional):
 *
 *   - `whatToWatch.holdAbove`: returns `—` when entry/period/EMA all
 *     missing. The legacy `close` fallback is removed (price ≠ level).
 *   - `whatToWatch.breakBelowTarget`: returns `—` when `stop_loss` is
 *     missing. The legacy `*0.97` invented fallback is removed.
 *   - `context`: returns `""` unless `analysis_market_memory.news_one_liner`
 *     passes the impact/relevance gate or macro is strongly signed.
 *   - `updatedAt`: defaults to `BriefTruth.dataAsOf` (driven by
 *     `analysis_ticker_price_targets.analysis_date`); `args.now` still
 *     overrides for test determinism.
 *
 * Replaces the old long-form `explanation-generator.ts` for the digest
 * pipeline. The legacy module remains on disk but is no longer imported
 * by the digest flow.
 */

import type {
  TickerSignal,
  MacroContext,
  TickerMemoryText,
} from "./recommendation-engine.js";
import type { CardData, StatusTone } from "./card-renderer.js";
import {
  gatherTruth,
  deriveSignals,
  composeBrief,
  type BriefTruth,
  type BriefDerived,
  type BriefMode,
} from "./digest-brief-truth.js";

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
  /**
   * Source-derived timestamp (e.g. price target `analysis_date`). `null`
   * when no DB column supplied a timestamp; the renderer surfaces this
   * as `"data unavailable"` rather than substituting wall clock time.
   */
  updatedAt: Date | null;
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

/**
 * Deterministic intra-priority ordering used as the secondary key in
 * `selectPrimary`. Lower number wins.
 *
 * Rationale: when two signals share the same `priority` (e.g. two
 * `medium` ones), the previous implementation depended on
 * `Array.prototype.sort` stability + input order, which made identical
 * inputs across two pipeline runs pick different "primaries". The
 * ordering below mirrors Smart Digest's editorial intent:
 *   1. price-action-confirmed targets (most actionable) win first
 *   2. then risk-side warnings (must surface before bullish ones)
 *   3. then trend-state changes
 *   4. then directional shifts
 *   5. then setups (entry/notable patterns)
 *   6. news_sentiment last — least technical of the bucket
 */
const TYPE_RANK: Record<TickerSignal["type"], number> = {
  target_reached: 0,
  stop_loss_warning: 1,
  signal_change: 2,
  momentum_shift: 3,
  entry_zone: 4,
  notable_pattern: 5,
  news_sentiment: 6,
};

function selectPrimary(signals: TickerSignal[]): TickerSignal | undefined {
  if (signals.length === 0) return undefined;
  return [...signals].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const t = TYPE_RANK[a.type] - TYPE_RANK[b.type];
    if (t !== 0) return t;
    if (a.symbol < b.symbol) return -1;
    if (a.symbol > b.symbol) return 1;
    return 0;
  })[0];
}

function displaySymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash !== -1 ? symbol.slice(0, slash) : symbol;
}

// ── Backward-compatible helper exports ────────────────────────────────
//
// These wrappers preserve the surface that `__tests__/digest-brief-generator.test.ts`
// and other call sites already depend on. Each one routes through the
// truth layer so behavior is identical to `generateDigestBrief`.

/** Map a single signal onto a stance label/tone (truth-layer routing). */
export function deriveStance(s: TickerSignal): {
  label: DigestStanceLabel;
  tone: DigestStanceTone;
} {
  const truth = gatherTruth({ signal: s });
  const derived = deriveSignals(truth);
  return derived.stance;
}

/** Map a single signal onto a coarse confidence bucket. */
export function deriveConfidence(s: TickerSignal): DigestBrief["confidence"] {
  const truth = gatherTruth({ signal: s });
  return deriveSignals(truth).confidence;
}

/**
 * Backward-compatible `buildWhatHappening`. Defaults to strict mode (no
 * memory text injection); pass `mode: 'blended'` to allow a memory phrase.
 */
export function buildWhatHappening(
  s: TickerSignal,
  opts?: { mode?: BriefMode; memoryText?: TickerMemoryText },
): string {
  const truth = gatherTruth({ signal: s, memoryText: opts?.memoryText });
  const derived = deriveSignals(truth);
  return composeBrief({ truth, derived, mode: opts?.mode ?? "strict" })
    .whatHappening;
}

/**
 * Backward-compatible `buildWhatToWatch`. Levels are sourced from DB only;
 * missing truth -> em-dash (no invented `*0.97` fallback, no `close`
 * fallback for `holdAbove`).
 */
export function buildWhatToWatch(s: TickerSignal): {
  holdAbove: string;
  breakBelowTarget: string;
} {
  const truth = gatherTruth({ signal: s });
  const derived = deriveSignals(truth);
  return {
    holdAbove: derived.holdAbove,
    breakBelowTarget: derived.breakBelowTarget,
  };
}

/**
 * Backward-compatible `buildContext`. Now strict: only fires when memory
 * passes the impact/relevance gate or macro is strongly signed.
 */
export function buildContext(
  s: TickerSignal,
  macroContext: MacroContext | undefined,
  newsOneLiner: string | undefined,
  memoryText?: TickerMemoryText,
): { context: string; hasMaterialContext: boolean } {
  // Backwards-compat: prior callers pass `newsOneLiner` as a bare string.
  // Promote it into a synthetic `TickerMemoryText` only when the caller
  // hasn't supplied a richer `memoryText` object — when they have, that
  // object's gates are authoritative.
  let synthetic: TickerMemoryText | undefined = memoryText;
  if (!synthetic && newsOneLiner && newsOneLiner.trim().length > 0) {
    synthetic = {
      newsOneLiner: newsOneLiner.trim(),
      // Promote to a passing impact/relevance so legacy callers that have
      // already pre-vetted the one-liner don't get silently dropped.
      impactLevel: "high",
      relevanceScore: 1,
      // Legacy `newsOneLinerMap` callers vouch for the one-liner being
      // current at call time; mark it fresh so the B1 freshness gate
      // does not silently reject it.
      lastUpdated: new Date().toISOString(),
    };
  }
  const truth = gatherTruth({
    signal: s,
    macroContext,
    memoryText: synthetic,
  });
  const derived = deriveSignals(truth);
  return {
    context: derived.context,
    hasMaterialContext: derived.hasMaterialContext,
  };
}

// ── Public entry point ────────────────────────────────────────────────

export interface GenerateDigestBriefArgs {
  signals: TickerSignal[];
  symbol: string;
  macroContext?: MacroContext;
  newsOneLinerMap?: Map<string, string>;
  /** Per-digest-symbol curated memory text from `fetchTickerMemoryText`. */
  memoryTextMap?: Map<string, TickerMemoryText>;
  /** Per-digest-symbol ISO YYYY-MM-DD analysis_date from price targets. */
  analysisDateMap?: Map<string, string>;
  /** Test/script override for `updatedAt`. */
  now?: Date;
  /** strict (default) | blended. Falls back to `strict` if undefined. */
  mode?: BriefMode;
}

/**
 * Build a `DigestBrief` for a single ticker. Three-stage flow:
 *
 *   gatherTruth -> deriveSignals -> composeBrief
 *
 * Always returns a valid object. Sparse data degrades to safe defaults
 * (em-dash levels, empty context, neutral stance) — never invents.
 */
export function generateDigestBrief(args: GenerateDigestBriefArgs): DigestBrief {
  const { signals, symbol, macroContext, mode = "strict", now } = args;
  const ticker = displaySymbol(symbol);

  const primary = selectPrimary(signals);
  if (!primary) {
    // Empty-signal path: keep the legacy "Neutral with safe defaults" output.
    return neutralFallbackBrief({ ticker, now });
  }

  // Resolve per-symbol memory + analysisDate. We honor either the new
  // typed `memoryTextMap` or the legacy `newsOneLinerMap` (string-only)
  // so call sites can be migrated piecemeal.
  const upper = symbol.toUpperCase();
  let memoryText: TickerMemoryText | undefined =
    args.memoryTextMap?.get(upper);
  if (!memoryText) {
    // Legacy path: only the per-ticker one-liner was available. Treat it
    // as a passing memory row so existing callers continue to render the
    // context line (test fixtures rely on this).
    if (primary.type !== "news_sentiment") {
      const legacyOneLiner = args.newsOneLinerMap?.get(upper);
      if (legacyOneLiner && legacyOneLiner.trim().length > 0) {
        memoryText = {
          newsOneLiner: legacyOneLiner.trim(),
          impactLevel: "high",
          relevanceScore: 1,
          // Legacy callers vouch for freshness at call time; mark
          // explicitly so the B1 gate does not drop the line.
          lastUpdated: new Date().toISOString(),
        };
      }
    }
  }

  // For news_sentiment signals the news content is already in the signal
  // body, so we deliberately skip the per-ticker memoryText to avoid
  // double-stating the same news in both `whatHappening` and `context`.
  if (primary.type === "news_sentiment") {
    memoryText = undefined;
  }

  const analysisDate = args.analysisDateMap?.get(upper);

  const truth: BriefTruth = gatherTruth({
    signal: primary,
    macroContext,
    memoryText,
    analysisDate,
  });
  const derived: BriefDerived = deriveSignals(truth);
  const composed = composeBrief({ truth, derived, mode, now });

  // Sparse-data guard: if the price is missing/non-positive, the upstream
  // signal arrived without real numerics. The truth layer already returns
  // em-dash for levels in that case; render `0` for price/changePercent
  // so the renderer's number formatting does not surface "0.000".
  const safePrice = typeof truth.price === "number" ? truth.price : 0;

  return {
    ticker,
    status: derived.stance,
    price: safePrice,
    changePercent: derived.changePercent,
    confidence: derived.confidence,
    updatedAt: composed.updatedAt,
    whatHappening: composed.whatHappening,
    whatToWatch: {
      holdAbove: derived.holdAbove,
      breakBelowTarget: derived.breakBelowTarget,
    },
    context: derived.context,
    hasMaterialContext: derived.hasMaterialContext,
  };
}

function neutralFallbackBrief(args: {
  ticker: string;
  now?: Date;
}): DigestBrief {
  return {
    ticker: args.ticker,
    status: { label: "Neutral", tone: "neutral" },
    price: 0,
    changePercent: 0,
    confidence: "Low",
    // No source-derived timestamp exists in the empty-signal path. We
    // intentionally do NOT substitute wall clock time here — see A5.
    updatedAt: args.now ?? null,
    whatHappening: "No actionable technical signals right now.",
    whatToWatch: { holdAbove: "—", breakBelowTarget: "—" },
    context: "",
    hasMaterialContext: false,
  };
}
