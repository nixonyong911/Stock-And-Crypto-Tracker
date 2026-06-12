/**
 * Smart Digest scoring layer.
 *
 * Deterministic (no LLM) derivation of the at-a-glance card signals from the
 * already-gathered `BriefTruth` + `BriefDerived`:
 *
 *   1. A directional score `D` in [-1, +1] blended from up to three pillars
 *      (Trend, Support/Resistance, News), each itself normalized to [-1, +1].
 *   2. A 5-level stance (Bearish .. Bullish) banded from `D`.
 *   3. A 1-5 star conviction from pillar agreement x |D|, tempered by the
 *      price-target confidence bucket.
 *   4. A "Levels to Watch" bar (min/max edges + buy/sell zones + current
 *      marker) spanning the 52-week range and the technical entry/target.
 *   5. A rule-based Action Guide sentence.
 *
 * Adapted from the algorithm in `.cursor/plans/temp.txt` to the data we
 * actually persist. Relative-volume confirmation and a true 50-day MA are
 * deliberately omitted (not yet computed upstream); both are noted as future
 * fidelity upgrades and their absence only narrows conviction, never invents.
 *
 * Pure / no I/O. All inputs trace to documented DB columns via `BriefTruth`.
 */

import type { BriefTruth, BriefDerived } from "./digest-brief-truth.js";

// ── Public types ──────────────────────────────────────────────────────

export type Stance5Tone =
  | "bearish"
  | "lean_bearish"
  | "neutral"
  | "lean_bullish"
  | "bullish";

export interface Stance5 {
  label: "Bearish" | "Lean Bearish" | "Neutral" | "Lean Bullish" | "Bullish";
  tone: Stance5Tone;
}

export interface LevelsBar {
  /** Lower edge of the rendered track. */
  min: number;
  /** Upper edge of the rendered track. */
  max: number;
  /** Current price marker (already clamped into [min, max]). */
  current: number;
  /** Green accumulation band, when entry levels exist. */
  buyZone?: { low: number; high: number };
  /** Red distribution band, when a target/resistance exists. */
  sellZone?: { low: number; high: number };
  /**
   * Zone provenance for debug/inspection: `anchored` = derived from real
   * technical levels (pivots/fibs/EMA/entry/target), `heuristic25` = the
   * statistical bottom/top-25%-of-range fallback.
   */
  buyZoneSource?: "anchored" | "heuristic25";
  sellZoneSource?: "anchored" | "heuristic25";
}

export interface SmartDigestScore {
  /** Blended directional score in [-1, +1]. */
  direction: number;
  stance: Stance5;
  /** Conviction stars, integer 1-5. */
  stars: number;
  levelsBar?: LevelsBar;
  actionGuide: string;
  /** Per-pillar normalized scores for debug/inspection (undefined = absent). */
  pillars: {
    trend?: number;
    supportResistance?: number;
    news?: number;
  };
}

// ── Small numeric helpers ─────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function triToScore(dir: "bullish" | "bearish" | "neutral"): number {
  if (dir === "bullish") return 1;
  if (dir === "bearish") return -1;
  return 0;
}

// ── Pillars ───────────────────────────────────────────────────────────

/**
 * Trend pillar: blend of the three per-timeframe signals (day/swing/long)
 * with the MACD histogram sign. Always available when signals exist.
 */
function computeTrendPillar(truth: BriefTruth): number {
  const s = truth.signals;
  const signalsAvg =
    (triToScore(s.day) + triToScore(s.swing) + triToScore(s.longTerm)) / 3;

  const macd = truth.signalFacts.macdHistogram;
  if (typeof macd === "number" && Number.isFinite(macd) && macd !== 0) {
    const macdSign = macd > 0 ? 1 : -1;
    return clamp(0.7 * signalsAvg + 0.3 * macdSign, -1, 1);
  }
  return clamp(signalsAvg, -1, 1);
}

/**
 * Support/Resistance pillar from the 52-week range: near the low reads as a
 * good-entry positive, near the high as extended/negative. Undefined when
 * the range or price is missing or degenerate.
 */
function computeSrPillar(truth: BriefTruth): number | undefined {
  const price = truth.price;
  const high = truth.range52w?.high;
  const low = truth.range52w?.low;
  if (
    !isFinitePositive(price) ||
    !isFinitePositive(high) ||
    !isFinitePositive(low) ||
    high <= low
  ) {
    return undefined;
  }
  const pctR = clamp((price - low) / (high - low), 0, 1);
  return clamp(1 - 2 * pctR, -1, 1);
}

/**
 * News pillar from aggregated market-memory sentiment. Prefers the numeric
 * mean; falls back to the bullish/bearish label. Undefined when neither
 * exists.
 */
function computeNewsPillar(truth: BriefTruth): number | undefined {
  const avg = truth.signalFacts.newsAvgSentiment;
  if (typeof avg === "number" && Number.isFinite(avg)) {
    return clamp(avg, -1, 1);
  }
  const label = truth.signalFacts.newsSentimentLabel;
  if (label === "bullish") return 0.5;
  if (label === "bearish") return -0.5;
  return undefined;
}

// ── Direction + stance ────────────────────────────────────────────────

const WEIGHTS = { trend: 0.4, sr: 0.3, news: 0.3 } as const;

function blendDirection(
  trend: number,
  sr: number | undefined,
  news: number | undefined,
): number {
  let weighted = WEIGHTS.trend * trend;
  let totalWeight = WEIGHTS.trend;
  if (sr !== undefined) {
    weighted += WEIGHTS.sr * sr;
    totalWeight += WEIGHTS.sr;
  }
  if (news !== undefined) {
    weighted += WEIGHTS.news * news;
    totalWeight += WEIGHTS.news;
  }
  if (totalWeight <= 0) return 0;
  return clamp(weighted / totalWeight, -1, 1);
}

export function stanceFromDirection(d: number): Stance5 {
  if (d >= 0.5) return { label: "Bullish", tone: "bullish" };
  if (d >= 0.15) return { label: "Lean Bullish", tone: "lean_bullish" };
  if (d > -0.15) return { label: "Neutral", tone: "neutral" };
  if (d > -0.5) return { label: "Lean Bearish", tone: "lean_bearish" };
  return { label: "Bearish", tone: "bearish" };
}

// ── Stars ─────────────────────────────────────────────────────────────

function confidenceScore(bucket: BriefDerived["confidence"]): number {
  if (bucket === "High") return 1;
  if (bucket === "Medium") return 0.6;
  return 0.3;
}

/**
 * 1-5 conviction. Agreement = fraction of available pillars whose sign
 * matches the blended direction (unanimous = 1, split = lower). Honest
 * uncertainty: a small |D| or conflicting pillars yields few stars even when
 * direction is mildly positive.
 */
function computeStars(
  direction: number,
  pillars: Array<number | undefined>,
  confidence: BriefDerived["confidence"],
): number {
  const present = pillars.filter(
    (p): p is number => p !== undefined,
  );
  const dirSign = direction > 0 ? 1 : direction < 0 ? -1 : 0;

  let agreement = 1;
  if (present.length > 0 && dirSign !== 0) {
    const agreeing = present.filter(
      (p) => (p > 0 ? 1 : p < 0 ? -1 : 0) === dirSign,
    ).length;
    agreement = agreeing / present.length;
  } else if (dirSign === 0) {
    agreement = 0.2; // no clear direction
  }

  const base = Math.abs(direction) * agreement; // [0, 1]
  const blended = 0.7 * base + 0.3 * confidenceScore(confidence);
  return clamp(Math.round(1 + blended * 4), 1, 5);
}

// ── Levels to Watch bar ───────────────────────────────────────────────

/** Fallback slice width per side: 0.25 ⇒ 25% buy / 50% neutral / 25% sell. */
const ZONE_FRAC = 0.25;
/** A zone anchor farther than this fraction from spot is not actionable. */
const MAX_ANCHOR_DIST = 0.25;
/** Cluster radius: nearby levels merge into one zone. */
const CLUSTER_EPS_ATR = 0.75;
const CLUSTER_EPS_PCT = 0.015;
/** Minimum half-width painted around an anchor level. */
const MIN_HALF_WIDTH_ATR = 0.5;
const MIN_HALF_WIDTH_PCT = 0.0075;
/** A zone may not exceed this fraction of the bar's range. */
const ZONE_MAX_WIDTH_FRAC = 0.35;
/** Anchored zones closer than this fraction of range read as noise. */
const MIN_ZONE_GAP_FRAC = 0.08;

interface Zone {
  low: number;
  high: number;
}

/**
 * Candidate support levels at or below spot / resistance levels at or above
 * spot, restricted to the stable frame and to within `MAX_ANCHOR_DIST` of
 * spot. `stopLoss` is deliberately excluded (an exit level, not an
 * accumulation anchor); periodLow/High are excluded because they define the
 * crypto frame fallback — using them as anchors would degenerate to the edge
 * zones we are replacing.
 */
function collectCandidates(
  truth: BriefTruth,
  price: number,
  stableLow: number,
  stableHigh: number,
): { supports: number[]; resistances: number[] } {
  const tl = truth.techLevels;
  const lvl = truth.levels;

  const supportRaw = [
    tl?.pivotS1,
    tl?.pivotS2,
    tl?.pivotS3,
    ...(tl?.fibLevels ?? []),
    lvl.ema50,
    lvl.entryLow,
    lvl.entryHigh,
  ];
  const resistanceRaw = [
    tl?.pivotR1,
    tl?.pivotR2,
    tl?.pivotR3,
    ...(tl?.fibLevels ?? []),
    lvl.ema50,
    lvl.target,
  ];

  const supports = supportRaw.filter(
    (c): c is number =>
      isFinitePositive(c) &&
      c <= price &&
      c >= stableLow &&
      (price - c) / price <= MAX_ANCHOR_DIST,
  );
  const resistances = resistanceRaw.filter(
    (c): c is number =>
      isFinitePositive(c) &&
      c >= price &&
      c <= stableHigh &&
      (c - price) / price <= MAX_ANCHOR_DIST,
  );
  return { supports, resistances };
}

/**
 * Build one anchored zone from candidate levels on one side of spot.
 * `side: "buy"` anchors at the nearest support below price (clustering
 * further supports within eps); `side: "sell"` mirrors above price.
 * Returns undefined when no candidates survive — caller falls back to the
 * statistical slice.
 */
function buildAnchoredZone(
  side: "buy" | "sell",
  candidates: number[],
  price: number,
  atr: number | undefined,
  barMin: number,
  barMax: number,
  range: number,
): Zone | undefined {
  if (candidates.length === 0) return undefined;

  const anchor = side === "buy" ? Math.max(...candidates) : Math.min(...candidates);
  const eps = Math.max(CLUSTER_EPS_ATR * (atr ?? 0), CLUSTER_EPS_PCT * price);
  const cluster = candidates.filter((c) => Math.abs(c - anchor) <= eps);
  const halfW = Math.max(MIN_HALF_WIDTH_ATR * (atr ?? 0), MIN_HALF_WIDTH_PCT * price);

  let low: number;
  let high: number;
  if (side === "buy") {
    low = Math.max(Math.min(...cluster) - halfW, barMin);
    high = Math.min(anchor + halfW, price); // never paints "buy" above spot
    if (high - low > ZONE_MAX_WIDTH_FRAC * range) {
      low = high - ZONE_MAX_WIDTH_FRAC * range;
    }
  } else {
    low = Math.max(anchor - halfW, price); // never paints "sell" below spot
    high = Math.min(Math.max(...cluster) + halfW, barMax);
    if (high - low > ZONE_MAX_WIDTH_FRAC * range) {
      high = low + ZONE_MAX_WIDTH_FRAC * range;
    }
  }

  if (!(high > low)) return undefined;
  return { low, high };
}

export function buildLevelsBar(truth: BriefTruth): LevelsBar | undefined {
  const price = truth.price;
  if (!isFinitePositive(price)) return undefined;

  const lvl = truth.levels;

  // Anchor the bar to a STABLE reference range rather than the daily-recomputed
  // entry/target band. Prefer the 52-week high/low (slow-moving — only shifts
  // as genuine yearly extremes change); fall back to the indicator lookback
  // period high/low for assets without 52-week data (e.g. crypto). Daily price
  // noise no longer drags the zones around — only a real new extreme does.
  const stableLow = isFinitePositive(truth.range52w?.low)
    ? (truth.range52w as { low: number }).low
    : lvl.periodLow;
  const stableHigh = isFinitePositive(truth.range52w?.high)
    ? (truth.range52w as { high: number }).high
    : lvl.periodHigh;

  if (
    !isFinitePositive(stableLow) ||
    !isFinitePositive(stableHigh) ||
    !(stableHigh > stableLow)
  ) {
    return undefined;
  }

  const range = stableHigh - stableLow;

  // Bar edges follow the stable range, widened only on a genuine 52-week breach
  // (a fresh all-time / period high or low print) so the marker still lands at
  // a sensible spot and the breached zone reaches the edge.
  const buyLow = Math.min(stableLow, price);
  const sellHigh = Math.max(stableHigh, price);

  // Statistical fallback zones: bottom slice of the yearly range reads as
  // "cheap" vs the last 52 weeks, top slice as "expensive".
  const heuristicBuy: Zone = { low: buyLow, high: stableLow + ZONE_FRAC * range };
  const heuristicSell: Zone = { low: stableHigh - ZONE_FRAC * range, high: sellHigh };

  // Preferred zones: anchored to real technical levels (validated pivots,
  // fib retracements, EMA-50, entry band / target), sized by ATR so calm
  // assets get tight zones and volatile ones get wide zones.
  const { supports, resistances } = collectCandidates(truth, price, stableLow, stableHigh);
  const atr = truth.techLevels?.atr;
  let buyZone = buildAnchoredZone("buy", supports, price, atr, buyLow, sellHigh, range);
  let sellZone = buildAnchoredZone("sell", resistances, price, atr, buyLow, sellHigh, range);
  let buySource: "anchored" | "heuristic25" = buyZone ? "anchored" : "heuristic25";
  let sellSource: "anchored" | "heuristic25" = sellZone ? "anchored" : "heuristic25";
  buyZone ??= heuristicBuy;
  sellZone ??= heuristicSell;

  // Never render nonsense: overlapping / near-touching zones (or a buy zone
  // painted above the sell zone) mean the anchors disagree with each other —
  // drop BOTH back to the statistical slices, which are disjoint by
  // construction. Mixed anchored/heuristic with touching bands reads as noise.
  if (buyZone.high >= sellZone.low - MIN_ZONE_GAP_FRAC * range) {
    buyZone = heuristicBuy;
    sellZone = heuristicSell;
    buySource = "heuristic25";
    sellSource = "heuristic25";
  }

  return {
    min: buyLow,
    max: sellHigh,
    current: clamp(price, buyLow, sellHigh),
    buyZone,
    sellZone,
    buyZoneSource: buySource,
    sellZoneSource: sellSource,
  };
}

// ── Action guide ──────────────────────────────────────────────────────

type ZonePosition = "below_buy" | "buy" | "between" | "sell" | "unknown";

function pricePosition(bar: LevelsBar | undefined): ZonePosition {
  if (!bar) return "unknown";
  const { current, buyZone, sellZone } = bar;
  if (buyZone) {
    if (current < buyZone.low) return "below_buy";
    if (current <= buyZone.high) return "buy";
  }
  if (sellZone && current >= sellZone.low) return "sell";
  return "between";
}

function buildActionGuide(stance: Stance5, position: ZonePosition): string {
  const bullish = stance.tone === "bullish" || stance.tone === "lean_bullish";
  const bearish = stance.tone === "bearish" || stance.tone === "lean_bearish";

  switch (position) {
    case "below_buy":
      if (bullish) {
        return "Price has dipped below the buy zone — an early entry, but let it stabilize before adding.";
      }
      if (bearish) {
        return "Price has slipped below the buy zone as momentum weakens — wait for it to stabilize before stepping in.";
      }
      return "Price is below the buy zone — wait for it to base before stepping in.";
    case "buy":
      if (bullish) {
        return "Price is in the buy zone with constructive momentum — a reasonable area to accumulate.";
      }
      if (bearish) {
        return "Price is in the buy zone but momentum is weak — wait for signs of stabilization before adding.";
      }
      return "Price sits in the buy zone — let momentum confirm before committing.";
    case "sell":
      if (bearish) {
        return "Price is extended near the sell zone with fading momentum — consider trimming into strength.";
      }
      return "Price is near the sell zone — consider taking some profit; avoid chasing here.";
    case "between":
      if (bullish) {
        return "Wait for a pullback toward the buy zone before adding. Existing holders can stay patient while the trend holds.";
      }
      if (bearish) {
        return "Momentum is soft — patience preferred until price reaches the buy zone.";
      }
      return "Mixed setup — let price reach the buy zone or confirm a breakout before acting.";
    default:
      return "Not enough level data for a precise plan — monitor price action around recent ranges.";
  }
}

// ── Public entry point ────────────────────────────────────────────────

export function computeSmartDigestScore(
  truth: BriefTruth,
  derived: BriefDerived,
): SmartDigestScore {
  const trend = computeTrendPillar(truth);
  const sr = computeSrPillar(truth);
  const news = computeNewsPillar(truth);

  const direction = blendDirection(trend, sr, news);
  const stance = stanceFromDirection(direction);
  const stars = computeStars(direction, [trend, sr, news], derived.confidence);
  const levelsBar = buildLevelsBar(truth);
  const actionGuide = buildActionGuide(stance, pricePosition(levelsBar));

  return {
    direction,
    stance,
    stars,
    levelsBar,
    actionGuide,
    pillars: { trend, supportResistance: sr, news },
  };
}
