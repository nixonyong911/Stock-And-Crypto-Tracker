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

// ── Levels bar: 52-week frame, technical-level-anchored zones ─────────
//
// The bar FRAME is the stable 52-week range (fallback: period high/low),
// widened only on a breach. The buy/sell ZONES anchor to real technical
// levels (validated pivots, fib retracements, EMA-50, entry band / target)
// near spot, sized by ATR; when no usable anchor exists on a side, that
// side falls back to the statistical bottom/top 25% slice of the frame.

describe("buildLevelsBar — 52-week-anchored zones", () => {
  it("entry band and target anchor the zones inside the 52w frame", () => {
    const truth = makeTruth({
      price: 170,
      range52w: { high: 236, low: 140 },
      levels: { entryLow: 150, entryHigh: 160, target: 200 },
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.min).toBe(140); // frame unchanged: 52w low
    expect(bar!.max).toBe(236); // frame unchanged: 52w high
    // Buy: nearest support below spot = entryHigh 160; no ATR → pct widths
    // (eps 2.55 keeps 150 out of the cluster, halfW = 0.75% of 170 = 1.275).
    expect(bar!.buyZoneSource).toBe("anchored");
    expect(bar!.buyZone!.low).toBeCloseTo(158.725, 3);
    expect(bar!.buyZone!.high).toBeCloseTo(161.275, 3);
    // Sell: nearest resistance above spot = target 200.
    expect(bar!.sellZoneSource).toBe("anchored");
    expect(bar!.sellZone!.low).toBeCloseTo(198.725, 3);
    expect(bar!.sellZone!.high).toBeCloseTo(201.275, 3);
    expect(bar!.current).toBe(170);
  });

  it("zones fall back to the bottom/top 25% slices when no anchors exist", () => {
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

  it("pivot supports/resistances anchor zones, clustered and sized by ATR", () => {
    const truth = makeTruth({
      price: 100,
      range52w: { high: 150, low: 60 },
      techLevels: {
        pivotS1: 96,
        pivotS2: 94.5, // within 0.75*ATR(=3) of S1 → merges into the cluster
        pivotS3: 80, // outside the cluster
        pivotR1: 110,
        atr: 4,
      },
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    // Buy: anchor S1=96, cluster {96, 94.5}, halfW = 0.5*ATR = 2.
    expect(bar!.buyZoneSource).toBe("anchored");
    expect(bar!.buyZone!.low).toBeCloseTo(92.5, 3); // 94.5 - 2
    expect(bar!.buyZone!.high).toBeCloseTo(98, 3); // min(96 + 2, price)
    // Sell: anchor R1=110, halfW 2, clamped low at price.
    expect(bar!.sellZoneSource).toBe("anchored");
    expect(bar!.sellZone!.low).toBeCloseTo(108, 3);
    expect(bar!.sellZone!.high).toBeCloseTo(112, 3);
  });

  it("pivots bracketing spot stay anchored with a volatility-scaled neutral sliver", () => {
    const truth = makeTruth({
      price: 100,
      range52w: { high: 150, low: 60 },
      techLevels: { pivotS1: 99.5, pivotR1: 100.5, atr: 4 }, // S1/R1 hug spot
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    // halfW = 0.5*ATR = 2, standoff = 0.25*halfW = 0.5 around the marker.
    expect(bar!.buyZoneSource).toBe("anchored");
    expect(bar!.sellZoneSource).toBe("anchored");
    expect(bar!.buyZone!.high).toBeCloseTo(99.5, 3); // min(S1+2, 100-0.5)
    expect(bar!.sellZone!.low).toBeCloseTo(100.5, 3); // max(R1-2, 100+0.5)
    expect(bar!.buyZone!.high).toBeLessThan(bar!.sellZone!.low);
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

  it("one-sided anchoring: anchored buy + heuristic sell coexist when disjoint", () => {
    const truth = makeTruth({
      price: 170,
      range52w: { high: 236, low: 140 },
      techLevels: { pivotS1: 165, atr: 2 },
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.buyZoneSource).toBe("anchored");
    expect(bar!.buyZone!.high).toBeLessThanOrEqual(170);
    expect(bar!.sellZoneSource).toBe("heuristic25");
    expect(bar!.sellZone).toEqual({ low: 212, high: 236 });
  });

  it("zone width is capped at 35% of the frame range", () => {
    const truth = makeTruth({
      price: 100,
      range52w: { high: 110, low: 90 }, // tight range 20 → cap = 7
      techLevels: { pivotS1: 98, pivotS2: 95, pivotS3: 93, atr: 8 }, // huge ATR
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    if (bar!.buyZoneSource === "anchored") {
      expect(bar!.buyZone!.high - bar!.buyZone!.low).toBeLessThanOrEqual(
        0.35 * (bar!.max - bar!.min) + 1e-9,
      );
    }
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
