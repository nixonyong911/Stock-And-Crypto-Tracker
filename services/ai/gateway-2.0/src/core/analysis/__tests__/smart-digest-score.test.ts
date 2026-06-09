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

// ── Levels bar: 52-week-anchored zones ────────────────────────────────
//
// Zones are derived from the STABLE 52-week range (fallback: period high/low),
// not the daily entry/target. Buy = lowest 25% of the range, Sell = highest
// 25%, neutral middle 50%. Bar edges = 52w low→high, widened only on a breach.

describe("buildLevelsBar — 52-week-anchored zones", () => {
  it("zones are the bottom/top 25% of the 52w range; entry/target ignored", () => {
    const truth = makeTruth({
      price: 170,
      range52w: { high: 236, low: 140 }, // range 96 → 25% = 24
      levels: { entryLow: 150, entryHigh: 160, target: 200 }, // ignored now
    });
    const bar = buildLevelsBar(truth);
    expect(bar).toBeDefined();
    expect(bar!.min).toBe(140); // 52w low
    expect(bar!.max).toBe(236); // 52w high
    expect(bar!.buyZone).toEqual({ low: 140, high: 164 }); // 140 .. 140+24
    expect(bar!.sellZone).toEqual({ low: 212, high: 236 }); // 236-24 .. 236
    expect(bar!.current).toBe(170);
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
