import { describe, it, expect } from "vitest";
import {
  computeSmartDigestScore,
  stanceFromDirection,
  buildLevelsBar,
} from "../smart-digest-score.js";
import type { BriefTruth, BriefDerived } from "../digest-brief-truth.js";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeTruth(overrides: Partial<BriefTruth> = {}): BriefTruth {
  return {
    symbol: "TEST",
    assetType: "stock",
    signals: {
      day: "neutral",
      swing: "neutral",
      longTerm: "neutral",
      alignment: "partial",
    },
    levels: {},
    signalFacts: { type: "entry_zone", priority: "medium" },
    ...overrides,
  };
}

function derived(confidence: BriefDerived["confidence"] = "Medium"): BriefDerived {
  // Only `confidence` is read by the score module; cast keeps the fixture lean.
  return { confidence } as BriefDerived;
}

// ── Stance bands ──────────────────────────────────────────────────────

describe("stanceFromDirection — 5-level bands", () => {
  it("maps each band including boundaries", () => {
    expect(stanceFromDirection(0.8).label).toBe("Bullish");
    expect(stanceFromDirection(0.5).label).toBe("Bullish");
    expect(stanceFromDirection(0.3).label).toBe("Lean Bullish");
    expect(stanceFromDirection(0.15).label).toBe("Lean Bullish");
    expect(stanceFromDirection(0).label).toBe("Neutral");
    expect(stanceFromDirection(-0.1).label).toBe("Neutral");
    expect(stanceFromDirection(-0.3).label).toBe("Lean Bearish");
    expect(stanceFromDirection(-0.5).label).toBe("Bearish");
    expect(stanceFromDirection(-0.9).label).toBe("Bearish");
  });

  it("tone matches label family", () => {
    expect(stanceFromDirection(0.8).tone).toBe("bullish");
    expect(stanceFromDirection(0.3).tone).toBe("lean_bullish");
    expect(stanceFromDirection(0).tone).toBe("neutral");
    expect(stanceFromDirection(-0.3).tone).toBe("lean_bearish");
    expect(stanceFromDirection(-0.8).tone).toBe("bearish");
  });
});

// ── Direction blend ───────────────────────────────────────────────────

describe("computeSmartDigestScore — direction", () => {
  it("bullish signals + near-52w-low drive a bullish stance", () => {
    const truth = makeTruth({
      price: 105,
      range52w: { high: 200, low: 100 },
      signals: { day: "bullish", swing: "bullish", longTerm: "bullish", alignment: "full" },
      signalFacts: { type: "entry_zone", priority: "high", macdHistogram: 0.5 },
    });
    const score = computeSmartDigestScore(truth, derived("High"));
    expect(score.direction).toBeGreaterThan(0.5);
    expect(score.stance.label).toBe("Bullish");
    expect(score.pillars.supportResistance).toBeGreaterThan(0); // near low = positive
  });

  it("bearish signals + near-52w-high drive a bearish stance", () => {
    const truth = makeTruth({
      price: 195,
      range52w: { high: 200, low: 100 },
      signals: { day: "bearish", swing: "bearish", longTerm: "bearish", alignment: "full" },
      signalFacts: { type: "stop_loss_warning", priority: "high", macdHistogram: -0.5 },
    });
    const score = computeSmartDigestScore(truth, derived("High"));
    expect(score.direction).toBeLessThan(-0.5);
    expect(score.stance.label).toBe("Bearish");
    expect(score.pillars.supportResistance).toBeLessThan(0); // near high = negative
  });

  it("no signals / no extras yields neutral with low conviction", () => {
    const truth = makeTruth({ price: 50 });
    const score = computeSmartDigestScore(truth, derived("Low"));
    expect(score.stance.label).toBe("Neutral");
    expect(score.stars).toBeLessThanOrEqual(2);
  });
});

// ── Stars ─────────────────────────────────────────────────────────────

describe("computeSmartDigestScore — stars", () => {
  it("unanimous strong direction + high confidence => 4-5 stars", () => {
    const truth = makeTruth({
      price: 102,
      range52w: { high: 200, low: 100 },
      signals: { day: "bullish", swing: "bullish", longTerm: "bullish", alignment: "full" },
      signalFacts: { type: "entry_zone", priority: "high", macdHistogram: 1, newsAvgSentiment: 0.8 },
    });
    const score = computeSmartDigestScore(truth, derived("High"));
    expect(score.stars).toBeGreaterThanOrEqual(4);
  });

  it("clamps stars to the 1-5 range", () => {
    const truth = makeTruth({ price: 50 });
    const score = computeSmartDigestScore(truth, derived("Low"));
    expect(score.stars).toBeGreaterThanOrEqual(1);
    expect(score.stars).toBeLessThanOrEqual(5);
  });
});

// ── Levels bar: 52-week frame, edge-anchored zones ────────────────────
//
// The bar FRAME is the stable 52-week range (fallback: period high/low),
// widened only on a breach. Zones ALWAYS span from the bar edges — the
// yearly low end is the deepest buy territory, the yearly high end the
// deepest sell territory. Only the INNER boundary is technical: when price
// trades near an edge, the boundary pulls to the nearest validated level
// (pivot / fib / EMA-50 / entry / target); otherwise it stays the
// statistical 25% slice.

describe("buildLevelsBar — edge-anchored zones", () => {
  it("zones always reach the bar edges", () => {
    const truth = makeTruth({
      price: 170,
      range52w: { high: 236, low: 140 },
      levels: { entryLow: 150, entryHigh: 160, target: 200 },
      techLevels: { pivotS1: 165, pivotR1: 175, atr: 4 },
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.buyZone!.low).toBe(bar!.min); // buy starts at the yearly low
    expect(bar!.sellZone!.high).toBe(bar!.max); // sell ends at the yearly high
  });

  it("zones are the bottom/top 25% slices when no anchors exist", () => {
    const truth = makeTruth({
      price: 170,
      range52w: { high: 236, low: 140 }, // range 96 → 25% = 24
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.buyZone).toEqual({ low: 140, high: 164 });
    expect(bar!.sellZone).toEqual({ low: 212, high: 236 });
    expect(bar!.buyZoneSource).toBe("heuristic25");
    expect(bar!.sellZoneSource).toBe("heuristic25");
  });

  it("near the yearly low, support pulls the buy boundary to the real level", () => {
    const truth = makeTruth({
      price: 80,
      range52w: { high: 110, low: 70 }, // range 40; buy cap = 70 + 14 = 84
      techLevels: { pivotS1: 78, pivotR1: 84, atr: 4 }, // halfW 2, standoff 0.5
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    // Buy: from the edge up to min(S1 + 2, price − 0.5) = 79.5, within cap.
    expect(bar!.buyZoneSource).toBe("anchored");
    expect(bar!.buyZone).toEqual({ low: 70, high: 79.5 });
    // Sell: R1 boundary at max(82, 80.5) = 82 is below the 35% cap line
    // (110 − 14 = 96) → zone too wide → statistical slice stays.
    expect(bar!.sellZoneSource).toBe("heuristic25");
    expect(bar!.sellZone).toEqual({ low: 100, high: 110 });
  });

  it("near the yearly high, resistance pulls the sell boundary to the real level", () => {
    const truth = makeTruth({
      price: 300,
      range52w: { high: 310, low: 200 }, // range 110; sell cap line = 310 − 38.5 = 271.5
      levels: { target: 305 },
      techLevels: { atr: 8 }, // halfW 4, standoff 1
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    // Sell: from max(305 − 4, 300 + 1) = 301 up to the yearly high.
    expect(bar!.sellZoneSource).toBe("anchored");
    expect(bar!.sellZone).toEqual({ low: 301, high: 310 });
    // Buy boundary would need to span up to ~spot (far past the 35% cap) → slice.
    expect(bar!.buyZoneSource).toBe("heuristic25");
    expect(bar!.buyZone).toEqual({ low: 200, high: 227.5 });
  });

  it("mid-range price keeps both statistical slices (boundary cap)", () => {
    const truth = makeTruth({
      price: 100,
      range52w: { high: 150, low: 60 }, // caps: buy ≤ 74, sell ≥ 136
      techLevels: { pivotS1: 96, pivotR1: 104, atr: 4 }, // both near spot, mid-range
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.buyZoneSource).toBe("heuristic25");
    expect(bar!.sellZoneSource).toBe("heuristic25");
    expect(bar!.buyZone).toEqual({ low: 60, high: 82.5 });
    expect(bar!.sellZone).toEqual({ low: 127.5, high: 150 });
  });

  it("anchors farther than 25% from spot are ignored", () => {
    const truth = makeTruth({
      price: 200,
      range52w: { high: 300, low: 100 },
      techLevels: { pivotS1: 120, pivotR1: 280 }, // 40% away on both sides
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.buyZoneSource).toBe("heuristic25");
    expect(bar!.sellZoneSource).toBe("heuristic25");
  });

  it("statistical side yields when it would cross an anchored boundary", () => {
    // Price in the bottom quarter of the range with an anchored resistance
    // just overhead: the 25% buy slice would reach past the sell boundary.
    const truth = makeTruth({
      price: 72,
      range52w: { high: 110, low: 70 }, // heuristic buy high = 80
      techLevels: { pivotR1: 74, atr: 4 }, // sell low = max(72, 73) = 73, within cap? 110-14=96... below
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    // Sell boundary 73 is below the cap line (96) → too wide → heuristic
    // sell [100, 110]; buy heuristic [70, 80]; disjoint — no clamp needed.
    expect(bar!.buyZone!.high).toBeLessThan(bar!.sellZone!.low);
    expect(bar!.buyZone!.low).toBe(bar!.min);
    expect(bar!.sellZone!.high).toBe(bar!.max);
  });

  it("price at an all-time low sits INSIDE the buy zone", () => {
    const truth = makeTruth({
      price: 65, // below the 52w low — fresh yearly low print
      range52w: { high: 110, low: 70 },
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.min).toBe(65); // bar widened to the breach
    expect(bar!.buyZone!.low).toBe(65);
    expect(bar!.buyZone!.high).toBeGreaterThanOrEqual(65);
    // Marker inside the buy band — the card reads "in the buy zone".
    expect(bar!.current).toBeGreaterThanOrEqual(bar!.buyZone!.low);
    expect(bar!.current).toBeLessThanOrEqual(bar!.buyZone!.high);
  });

  it("price above 52w high (breach): bar + sell zone extend up to price", () => {
    const truth = makeTruth({
      price: 70,
      range52w: { high: 50, low: 10 }, // range 40 → 25% = 10
      levels: { target: 80 }, // ignored — only a breach extends the edge
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.min).toBe(10);
    expect(bar!.max).toBe(70); // extended to current (above 52w high)
    expect(bar!.buyZone).toEqual({ low: 10, high: 20 });
    expect(bar!.sellZone).toEqual({ low: 40, high: 70 }); // 50-10 .. extended high
    expect(bar!.current).toBe(70);
  });

  it("no 52w data → falls back to indicator period high/low", () => {
    const truth = makeTruth({
      price: 4317.39,
      levels: { periodHigh: 4651.64, periodLow: 4274.22 }, // range 377.42 → 25% = 94.355
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.min).toBe(4274.22);
    expect(bar!.max).toBe(4651.64);
    expect(bar!.buyZone!.high).toBeCloseTo(4368.575, 3);
    expect(bar!.sellZone!.low).toBeCloseTo(4557.285, 3);
    expect(bar!.current).toBe(4317.39);
  });

  it("all-time-high: bar + sell zone extend up to current price", () => {
    const truth = makeTruth({
      price: 500,
      range52w: { high: 420, low: 300 }, // range 120 → 25% = 30
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.max).toBe(500); // current price is the new ceiling
    expect(bar!.buyZone).toEqual({ low: 300, high: 330 });
    expect(bar!.sellZone).toEqual({ low: 390, high: 500 });
    expect(bar!.current).toBe(500);
  });

  it("omits the bar when there is no stable high (no 52w high, no period high)", () => {
    const truth = makeTruth({ price: 100, range52w: { low: 80 } });
    expect(buildLevelsBar(truth)).toBeUndefined();
  });

  it("omits the bar when price is missing", () => {
    const truth = makeTruth({ range52w: { high: 200, low: 100 } });
    expect(buildLevelsBar(truth)).toBeUndefined();
  });

  it("clamps the current marker into the track", () => {
    const truth = makeTruth({
      price: 300, // above everything
      range52w: { high: 200, low: 100 },
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.current).toBeLessThanOrEqual(bar!.max);
    expect(bar!.current).toBeGreaterThanOrEqual(bar!.min);
  });
});

// ── Action guide branches ─────────────────────────────────────────────

describe("computeSmartDigestScore — action guide", () => {
  it("buy-zone + bullish suggests accumulation", () => {
    const truth = makeTruth({
      price: 155,
      range52w: { high: 236, low: 140 },
      signals: { day: "bullish", swing: "bullish", longTerm: "bullish", alignment: "full" },
      levels: { entryLow: 150, entryHigh: 160, target: 200 },
      signalFacts: { type: "entry_zone", priority: "high", macdHistogram: 0.5 },
    });
    const score = computeSmartDigestScore(truth, derived("High"));
    expect(score.actionGuide.toLowerCase()).toContain("buy zone");
  });

  it("between zones + bullish suggests waiting for a pullback", () => {
    const truth = makeTruth({
      price: 180,
      range52w: { high: 236, low: 140 },
      signals: { day: "bullish", swing: "bullish", longTerm: "bullish", alignment: "full" },
      levels: { entryLow: 150, entryHigh: 160, target: 200 },
    });
    const score = computeSmartDigestScore(truth, derived("Medium"));
    expect(score.actionGuide.toLowerCase()).toContain("pullback");
  });

  it("near sell zone suggests trimming / profit", () => {
    const truth = makeTruth({
      price: 225, // within the top-25% sell zone [212, 236]
      range52w: { high: 236, low: 140 },
      levels: { entryLow: 150, entryHigh: 160, target: 200 },
    });
    const score = computeSmartDigestScore(truth, derived("Medium"));
    expect(score.actionGuide.toLowerCase()).toMatch(/trim|profit/);
  });

  it("no levels data => monitor message", () => {
    const truth = makeTruth({ price: 50 });
    const score = computeSmartDigestScore(truth, derived("Low"));
    expect(score.actionGuide.toLowerCase()).toContain("not enough level data");
  });
});

// ── Regime pillar (long-horizon anchor) ───────────────────────────────

describe("computeSmartDigestScore — regime pillar", () => {
  it("absent without longTrend data (weights renormalize)", () => {
    const truth = makeTruth({ price: 100, range52w: { high: 200, low: 50 } });
    const score = computeSmartDigestScore(truth, derived());
    expect(score.pillars.regime).toBeUndefined();
  });

  it("positive when price is well above the 200-day MA", () => {
    const truth = makeTruth({
      price: 110,
      longTrend: { sma50: 105, sma200: 100 },
    });
    const score = computeSmartDigestScore(truth, derived());
    expect(score.pillars.regime).toBeGreaterThan(0.5);
  });

  it("negative when price is well below the 200-day MA", () => {
    const truth = makeTruth({
      price: 90,
      longTrend: { sma50: 95, sma200: 100 },
    });
    const score = computeSmartDigestScore(truth, derived());
    expect(score.pillars.regime).toBeLessThan(-0.5);
  });

  it("graded cross: a marginal 50/200 spread does not saturate", () => {
    const truthBarelyAbove = makeTruth({
      price: 100.5,
      longTrend: { sma50: 100.1, sma200: 100 },
    });
    const r1 = computeSmartDigestScore(truthBarelyAbove, derived()).pillars.regime!;
    expect(Math.abs(r1)).toBeLessThan(0.3);
  });

  it("works with sma200 alone (no sma50)", () => {
    const truth = makeTruth({ price: 110, longTrend: { sma200: 100 } });
    const score = computeSmartDigestScore(truth, derived());
    expect(score.pillars.regime).toBeGreaterThan(0.5);
  });

  it("SPX500 regression: dip in a multi-month uptrend is NOT Bearish/5-stars", () => {
    // Real shape of the 2026-06-12 card that misread: price 7414.8 near
    // record highs, all short-term signals bearish after a ~2.3% pullback,
    // bearish news window — but price sits ~6% above its 200-day MA with a
    // golden cross intact.
    const truth = makeTruth({
      symbol: "SPX500",
      price: 7414.8,
      signals: { day: "bearish", swing: "bearish", longTerm: "bullish", alignment: "partial" },
      longTrend: { sma50: 7280, sma200: 7000 },
      signalFacts: {
        type: "signal_change",
        priority: "high",
        macdHistogram: -12,
        newsAvgSentiment: -0.5,
      },
    });
    const score = computeSmartDigestScore(truth, derived("High"));
    expect(score.stance.label).not.toBe("Bearish");
    expect(score.stars).toBeLessThanOrEqual(3);
    expect(score.pillars.regime).toBeGreaterThan(0.5);
  });

  it("regime joins the stars agreement set (conflict tempers conviction)", () => {
    const bearishEverything = makeTruth({
      price: 195,
      range52w: { high: 200, low: 100 },
      signals: { day: "bearish", swing: "bearish", longTerm: "bearish", alignment: "full" },
      signalFacts: { type: "stop_loss_warning", priority: "high", macdHistogram: -0.5, newsAvgSentiment: -0.8 },
    });
    const unanimous = computeSmartDigestScore(bearishEverything, derived("High"));

    const withBullishRegime = makeTruth({
      ...bearishEverything,
      longTrend: { sma50: 190, sma200: 175 }, // price above 200-day: regime disagrees
    });
    const split = computeSmartDigestScore(withBullishRegime, derived("High"));

    expect(split.stars).toBeLessThanOrEqual(unanimous.stars);
    expect(split.direction).toBeGreaterThan(unanimous.direction);
  });
});
