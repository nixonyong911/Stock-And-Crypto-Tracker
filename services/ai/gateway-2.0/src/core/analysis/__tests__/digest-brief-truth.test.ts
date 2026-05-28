import { describe, it, expect } from "vitest";
import {
  gatherTruth,
  deriveSignals,
  deriveStrengthFromTruth,
  composeBrief,
  trimContextLine,
  type BriefTruth,
  type TickerMemoryText,
} from "../digest-brief-truth.js";
import type {
  TickerSignal,
  MacroContext,
} from "../recommendation-engine.js";

// ── Fixtures ────────────────────────────────────────────────────────

function makeStockSignal(overrides: Partial<TickerSignal> = {}): TickerSignal {
  return {
    symbol: "AAPL",
    assetType: "stock",
    type: "entry_zone",
    priority: "high",
    timeframeAlignment: "full",
    headline: "AAPL near support",
    rawData: {
      close: 175,
      latestOpen: 170,
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
      entryLow: 168,
      entryHigh: 178,
      stopLoss: 162,
      targetPrice: 200,
      ema20: 171,
      ema50: 165,
      periodLow: 167,
      periodHigh: 180,
      confidence: 0.78,
      ...overrides.rawData,
    },
    ...overrides,
  };
}

function makeCryptoSignal(overrides: Partial<TickerSignal> = {}): TickerSignal {
  return {
    symbol: "BTC/USD",
    assetType: "crypto",
    type: "target_reached",
    priority: "high",
    timeframeAlignment: "full",
    headline: "BTC pushing into resistance",
    rawData: {
      close: 74_320,
      latestOpen: 73_120,
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
      entryLow: 71_800,
      entryHigh: 73_500,
      targetPrice: 74_900,
      stopLoss: 70_400,
      confidence: 0.82,
      ...overrides.rawData,
    },
    ...overrides,
  };
}

const macroSupportive: MacroContext = {
  headlines: ["Rate cut odds firming"],
  dominantTheme: "macro",
  overallSentiment: 0.4,
};

const macroNeutral: MacroContext = {
  headlines: [],
  dominantTheme: null,
  overallSentiment: 0.05,
};

const memoryHighImpact: TickerMemoryText = {
  newsOneLiner: "Stronger services guidance lifts mega-cap tech.",
  summary: "Apple's analyst day reset services growth higher; sector flows supportive.",
  keyFacts: ["Services revenue beat consensus", "ETF inflows accelerating"],
  marketImplications: "Watch for follow-through bid in mega-cap tech ETFs.",
  impactLevel: "high",
  relevanceScore: 0.82,
  sentimentScore: 0.45,
  lastUpdated: "2026-05-08T12:00:00Z",
};

// ── gatherTruth ──────────────────────────────────────────────────────

describe("gatherTruth — per-field source mapping", () => {
  it("maps price/open from analysis_ticker_price_targets.latest_close/open", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.price).toBe(175);
    expect(truth.open).toBe(170);
  });

  it("maps levels from analysis_ticker_price_targets columns", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.levels.entryLow).toBe(168);
    expect(truth.levels.entryHigh).toBe(178);
    expect(truth.levels.target).toBe(200);
    expect(truth.levels.stopLoss).toBe(162);
    expect(truth.levels.ema20).toBe(171);
    expect(truth.levels.ema50).toBe(165);
    expect(truth.levels.periodLow).toBe(167);
    expect(truth.levels.periodHigh).toBe(180);
  });

  it("maps signal_summary trio onto truth.signals (day/swing/long_term)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        timeframeAlignment: "partial",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "neutral",
          longTermSignal: "bearish",
        },
      }),
    });
    expect(truth.signals.day).toBe("bullish");
    expect(truth.signals.swing).toBe("neutral");
    expect(truth.signals.longTerm).toBe("bearish");
    expect(truth.signals.alignment).toBe("partial");
  });

  it("maps confidence column onto truth.rawConfidence", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.rawConfidence).toBe(0.78);
  });

  it("maps analysis_date onto truth.dataAsOf when supplied", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      analysisDate: "2026-05-08",
    });
    expect(truth.dataAsOf).toBe("2026-05-08");
  });

  it("maps macd_histogram from analysis_indicators_*.macd_histogram", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "momentum_shift",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          macdHistogram: 1.5,
        },
      }),
    });
    expect(truth.signalFacts.macdHistogram).toBe(1.5);
  });

  it("maps detected_patterns[0] from analysis_*_candlestick_pattern", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "notable_pattern",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          patterns: [
            { pattern: "morning_star", confidence: 0.92, signal: "bullish" },
          ],
        },
      }),
    });
    expect(truth.signalFacts.pattern).toEqual({
      name: "morning_star",
      signal: "bullish",
    });
  });

  it("maps news fields from aggregated analysis_market_memory rows", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 8,
          newsSentimentLabel: "bullish",
          newsAvgSentiment: 0.55,
        },
      }),
    });
    expect(truth.signalFacts.newsArticleCount).toBe(8);
    expect(truth.signalFacts.newsSentimentLabel).toBe("bullish");
  });

  it("attaches memoryText when supplied", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: memoryHighImpact,
    });
    expect(truth.memoryText).toEqual(memoryHighImpact);
  });

  it("attaches macro only when dominantTheme is set", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      macroContext: macroSupportive,
    });
    expect(truth.macro).toEqual({
      dominantTheme: "macro",
      overallSentiment: 0.4,
    });

    const noTheme = gatherTruth({
      signal: makeStockSignal(),
      macroContext: macroNeutral,
    });
    expect(noTheme.macro).toBeUndefined();
  });
});

describe("gatherTruth — missing-data omission", () => {
  it("omits stopLoss when DB row had no stop_loss", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
        },
      }),
    });
    expect(truth.levels.stopLoss).toBeUndefined();
  });

  it("omits entryLow/periodLow/ema20 when none of those columns are populated", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
        },
      }),
    });
    expect(truth.levels.entryLow).toBeUndefined();
    expect(truth.levels.periodLow).toBeUndefined();
    expect(truth.levels.ema20).toBeUndefined();
  });

  it("omits dataAsOf when no analysis_date is supplied", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.dataAsOf).toBeUndefined();
  });

  it("omits price when close is 0 or non-finite (legacy stub guard)", () => {
    const zero = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 0,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
        },
      }),
    });
    expect(zero.price).toBeUndefined();

    const nan = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: Number.NaN,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
        },
      }),
    });
    expect(nan.price).toBeUndefined();
  });

  it("omits memoryText when none supplied", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.memoryText).toBeUndefined();
  });

  it("does not invent any level not present in DB inputs", () => {
    const sparse = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
        },
      }),
    });
    // No level was supplied; the levels object should be empty.
    expect(Object.keys(sparse.levels)).toHaveLength(0);
  });
});

// ── A4 sanity guards ────────────────────────────────────────────────

describe("gatherTruth — sanity guards (A4)", () => {
  it("omits truth.open and flags 'open_close_unit_mismatch' for the captured GOLD row (close 46.056, open 4613.35)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        symbol: "GOLD",
        rawData: {
          close: 46.056,
          latestOpen: 4613.35,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
        },
      }),
    });
    expect(truth.price).toBe(46.056);
    expect(truth.open).toBeUndefined();
    expect(truth.truthFlags).toContain("open_close_unit_mismatch");
  });

  it("omits an out-of-band level and flags 'level_out_of_band:entryLow' (close 1.5 vs entryLow 168)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 1.5,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          stopLoss: 1.2,
        },
      }),
    });
    expect(truth.levels.entryLow).toBeUndefined();
    expect(truth.levels.stopLoss).toBe(1.2);
    expect(truth.truthFlags).toContain("level_out_of_band:entryLow");
  });

  it("does not flag when open and close are within the sane band", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.open).toBe(170);
    expect(truth.truthFlags).toBeUndefined();
  });

  it("propagates the omitted open into changePercent = 0 (no -99% leakage)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        symbol: "GOLD",
        rawData: {
          close: 46.056,
          latestOpen: 4613.35,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
        },
      }),
    });
    const derived = deriveSignals(truth);
    expect(derived.changePercent).toBe(0);
  });
});

describe("gatherTruth — asset coverage", () => {
  it("works for stock fixtures with full DB truth", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(truth.assetType).toBe("stock");
    expect(truth.symbol).toBe("AAPL");
    expect(truth.price).toBe(175);
    expect(truth.levels.stopLoss).toBe(162);
  });

  it("works for crypto fixtures with full DB truth", () => {
    const truth = gatherTruth({ signal: makeCryptoSignal() });
    expect(truth.assetType).toBe("crypto");
    expect(truth.symbol).toBe("BTC/USD");
    expect(truth.price).toBe(74_320);
    expect(truth.levels.target).toBe(74_900);
    expect(truth.levels.stopLoss).toBe(70_400);
  });
});

// ── deriveSignals ────────────────────────────────────────────────────

describe("deriveSignals — levels cascade", () => {
  it("default branch: holdAbove prefers ema20 over entryLow when ema20 is tighter to spot; break stays stopLoss", () => {
    // makeStockSignal default: close=175, entryLow=168, ema20=171, stopLoss=162.
    // max(entryLow=168, ema20=171) = 171 → ema20 wins because it sits
    // closer to spot. stopLoss is preserved as the wider invalidation.
    const truth = gatherTruth({ signal: makeStockSignal() });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("171.00");
    expect(d.breakBelowTarget).toBe("162.00");
  });

  it("default branch: holdAbove falls to entryLow when ema20 is below entryLow (entry zone above spot)", () => {
    // Bullish setup waiting to be claimed: price below entryLow, ema20
    // also below spot. max(entryLow, ema20) = entryLow → keeps the
    // structural narrative ("wait for it to reclaim $X").
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 165,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 170,
          ema20: 164,
          stopLoss: 158,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("170.00");
    expect(d.breakBelowTarget).toBe("158.00");
  });

  it("default branch: when stopLoss is missing, break falls back to min(structHold, ema20)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          ema20: 171,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("171.00");
    expect(d.breakBelowTarget).toBe("168.00");
  });

  it("returns em-dash for breakBelowTarget when stopLoss is missing", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          periodLow: 167,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.breakBelowTarget).toBe("—");
  });

  it("returns em-dash for holdAbove when entry/period/ema are all missing", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          stopLoss: 160,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("—");
  });

  it("does not fall through to close as holdAbove (price ≠ level)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("—");
    expect(d.holdAbove).not.toBe("175.00");
  });

  it("falls back periodLow then ema20 when entryLow missing", () => {
    // periodLow=168 + ema20=172 → max(168,172)=172 wins (ema20 closer to spot).
    const periodLowTruth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          periodLow: 168,
          ema20: 172,
        },
      }),
    });
    expect(deriveSignals(periodLowTruth).holdAbove).toBe("172.00");

    // periodLow=170 only (no ema20) → falls through cascade to periodLow.
    const periodLowOnly = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          periodLow: 170,
        },
      }),
    });
    expect(deriveSignals(periodLowOnly).holdAbove).toBe("170.00");

    // ema20 only → falls through cascade to ema20.
    const ema20Truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          ema20: 172,
        },
      }),
    });
    expect(deriveSignals(ema20Truth).holdAbove).toBe("172.00");
  });

  it("target_reached (fresh hit): holdAbove=target, breakBelow=ema20 when target > ema20", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 210,
          latestOpen: 205,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          entryHigh: 178,
          stopLoss: 162,
          targetPrice: 200,
          ema20: 171,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("200.00");
    expect(d.breakBelowTarget).toBe("171.00");
  });

  it("target_reached (extended): holdAbove=ema20, breakBelow=target when ema20 > target", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 240,
          latestOpen: 235,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          entryHigh: 178,
          stopLoss: 162,
          targetPrice: 200,
          ema20: 225,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("225.00");
    expect(d.breakBelowTarget).toBe("200.00");
  });

  it("target_reached: inversion guard activates when target missing (hold=entryHigh=break), falls to default", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 210,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          entryHigh: 178,
          stopLoss: 162,
          ema20: 171,
        },
      }),
    });
    const d = deriveSignals(truth);
    // Without target, both hold and break select entryHigh (178) → equal → guard
    // falls back to default: entryLow / stopLoss
    expect(d.holdAbove).toBe("168.00");
    expect(d.breakBelowTarget).toBe("162.00");
  });

  it("stop_loss_warning: uses default cascade (entryLow / stopLoss) since stop < periodLow by construction", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "stop_loss_warning",
        rawData: {
          close: 163,
          latestOpen: 165,
          daySignal: "bearish",
          swingSignal: "bearish",
          longTermSignal: "neutral",
          entryLow: 168,
          stopLoss: 162,
          periodLow: 155,
          ema50: 160,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("168.00");
    expect(d.breakBelowTarget).toBe("162.00");
  });

  it("inversion safety: falls back to default cascade when holdAbove <= breakBelowTarget", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 210,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          // No target, no entryHigh — holdAbove would use ema20,
          // breakBelowTarget would also use ema20 → equal → inversion guard
          ema20: 171,
          entryLow: 168,
          stopLoss: 162,
        },
      }),
    });
    const d = deriveSignals(truth);
    // Safety guard falls back to default: entryLow / stopLoss
    expect(d.holdAbove).toBe("168.00");
    expect(d.breakBelowTarget).toBe("162.00");
  });
});

describe("deriveSignals — context", () => {
  it("uses news_one_liner when memory passes impact/relevance gate", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: memoryHighImpact,
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("news_one_liner");
    expect(d.context).toBe(memoryHighImpact.newsOneLiner);
    expect(d.hasMaterialContext).toBe(true);
  });

  it("omits context when memory has impactLevel='low' even with news_one_liner", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: {
        newsOneLiner: "Some line",
        impactLevel: "low",
        relevanceScore: 0.9,
      },
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("none");
    expect(d.context).toBe("");
    expect(d.hasMaterialContext).toBe(false);
  });

  it("omits context when relevance_score is below 0.5", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: {
        newsOneLiner: "Some line",
        impactLevel: "high",
        relevanceScore: 0.3,
      },
    });
    expect(deriveSignals(truth).context).toBe("");
  });

  it("falls back to macro line when memory missing and macro is strongly signed", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      macroContext: macroSupportive,
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("macro");
    expect(d.context).toMatch(/supportive/);
  });

  it("omits macro fallback when |overallSentiment| < 0.3", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      macroContext: { headlines: [], dominantTheme: "macro", overallSentiment: 0.2 },
    });
    expect(deriveSignals(truth).contextSource).toBe("none");
  });
});

// ── Step-5 surfacing decision (separated from association ranking) ──

describe("deriveSignals — Step-5 surfacing decision", () => {
  // Recent timestamp so freshness component is meaningful regardless of
  // when the test runs.
  const recentIso = (): string =>
    new Date(Date.now() - 6 * 3_600_000).toISOString();

  it("on-symbol one-liner pushes a fresh, high-impact row above the threshold", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: {
        newsOneLiner: "Apple's services beat lifts AAPL guidance.",
        impactLevel: "high",
        relevanceScore: 0.8,
        lastUpdated: recentIso(),
      },
      aliasContext: { symbolUpper: "AAPL", aliases: ["AAPL"] },
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("news_one_liner");
    expect(d.hasMaterialContext).toBe(true);
  });

  it("medium-impact row whose one-liner does NOT name the symbol is omitted with omitted_low_score", () => {
    // MSFT scenario: theme mentions MSFT (carries affinity) but the
    // one-liner is about Google Cloud. Floor passes; surfacing score
    // drops below 0.55 because:
    //   impact(medium=0.5)*0.3 + relevance(0.6)*0.2 + freshness(~1)*0.2 + onSymbol(0)*0.3
    //   = 0.15 + 0.12 + 0.20 + 0 = 0.47 < 0.55
    const truth = gatherTruth({
      signal: makeStockSignal({ symbol: "MSFT" }),
      memoryText: {
        newsOneLiner: "Google Cloud and Genpact's agentic AI deal for CFO offices.",
        impactLevel: "medium",
        relevanceScore: 0.6,
        lastUpdated: recentIso(),
      },
      aliasContext: { symbolUpper: "MSFT", aliases: ["MSFT"] },
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("omitted_low_score");
    expect(d.context).toBe("");
    expect(d.hasMaterialContext).toBe(false);
  });

  it("high-impact sector context without on-symbol mention still surfaces (no over-suppression)", () => {
    // TSLA scenario: a sector-tariff line that does not name TSLA. We
    // explicitly do NOT want a hard one-liner-mention gate to kill
    // legitimate indirect context. The score should clear the threshold
    // on impact + relevance + freshness alone:
    //   high(0.8)*0.3 + 0.85*0.2 + 1.0*0.2 + 0*0.3 = 0.61 > 0.55
    const truth = gatherTruth({
      signal: makeStockSignal({ symbol: "TSLA" }),
      memoryText: {
        newsOneLiner:
          "Trump's 25% auto tariff threat opens a new trade-war front against European manufacturers.",
        impactLevel: "high",
        relevanceScore: 0.85,
        lastUpdated: recentIso(),
      },
      aliasContext: { symbolUpper: "TSLA", aliases: ["TSLA"] },
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("news_one_liner");
  });

  it("floor still gates: low impact never surfaces regardless of score components", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: {
        newsOneLiner: "AAPL antitrust filler.",
        impactLevel: "low",
        relevanceScore: 1.0,
        lastUpdated: recentIso(),
      },
      aliasContext: { symbolUpper: "AAPL", aliases: ["AAPL"] },
    });
    const d = deriveSignals(truth);
    // Floor failed -> falls through to macro (none here) -> "none",
    // NOT omitted_low_score (which is reserved for floor-passing rows).
    expect(d.contextSource).toBe("none");
  });

  it("floor still gates: relevance below 0.5 never surfaces", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: {
        newsOneLiner: "AAPL filler line.",
        impactLevel: "high",
        relevanceScore: 0.3,
        lastUpdated: recentIso(),
      },
      aliasContext: { symbolUpper: "AAPL", aliases: ["AAPL"] },
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("none");
  });

  it("backwards compatible: omitted aliasContext falls back to floor-only behavior", () => {
    // Same fixture as the legacy "omits context when memory has impactLevel='low'"
    // test, but with a one-liner that doesn't mention the symbol. Without
    // aliasContext the surfacing layer collapses to floor-only and a
    // floor-passing row surfaces regardless of one-liner specificity.
    const truth = gatherTruth({
      signal: makeStockSignal({ symbol: "MSFT" }),
      memoryText: {
        newsOneLiner: "Google Cloud and Genpact's agentic AI deal for CFO offices.",
        impactLevel: "medium",
        relevanceScore: 0.6,
        lastUpdated: recentIso(),
      },
      // No aliasContext: legacy callers see no behavior change.
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("news_one_liner");
  });

  it("AAPL stale-row scenario: stale chosen row falls below floor freshness, contextSource=none", () => {
    // Captured live from prod (170h-old Berkshire row). The floor
    // freshness gate (72h) eliminates it before surfacing is even
    // evaluated.
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: {
        newsOneLiner: "Buffett's 'risky' crypto warning boosts AAPL credibility.",
        impactLevel: "medium",
        relevanceScore: 1,
        lastUpdated: new Date(Date.now() - 170 * 3_600_000).toISOString(),
      },
      aliasContext: { symbolUpper: "AAPL", aliases: ["AAPL"] },
    });
    const d = deriveSignals(truth);
    expect(d.contextSource).toBe("none");
  });
});

describe("deriveSignals — confidence and stance", () => {
  it("returns High when raw confidence >= 0.7 and alignment is full", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    expect(deriveSignals(truth).confidence).toBe("High");
  });

  it("returns Low when alignment is conflict regardless of raw confidence", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        timeframeAlignment: "conflict",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bearish",
          longTermSignal: "neutral",
          confidence: 0.95,
        },
      }),
    });
    expect(deriveSignals(truth).confidence).toBe("Low");
    expect(deriveSignals(truth).stance.label).toBe("Caution");
  });

  it("news_sentiment with >= 7 articles -> Medium confidence", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 8,
          newsSentimentLabel: "bullish",
        },
      }),
    });
    expect(deriveSignals(truth).confidence).toBe("Medium");
  });

  // ── B3 confidence bucketing ────────────────────────────────────

  it("news_sentiment: count*|avg| >= 6 -> High (news_score source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 8,
          newsAvgSentiment: 0.8,
          newsSentimentLabel: "bullish",
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidence).toBe("High");
    expect(out.confidenceSource).toBe("news_score");
  });

  it("news_sentiment: count*|avg| in [4, 6) -> Medium (news_score source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 10,
          newsAvgSentiment: 0.5,
          newsSentimentLabel: "bullish",
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidence).toBe("Medium");
    expect(out.confidenceSource).toBe("news_score");
  });

  it("news_sentiment: count*|avg| < 4 -> Low even with many articles (news_score source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 12,
          newsAvgSentiment: 0.3,
          newsSentimentLabel: "bullish",
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidence).toBe("Low");
    expect(out.confidenceSource).toBe("news_score");
  });

  it("news_sentiment without avg -> falls back to count_only (legacy path)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 8,
          newsSentimentLabel: "bullish",
        },
      }),
    });
    expect(deriveSignals(truth).confidenceSource).toBe("news_count_only");
  });

  it("rawConfidence == 1.0 with high strength rescues to High (strength_from_signal source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          confidence: 1.0,
          entryLow: 168,
          entryHigh: 178,
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidence).toBe("High");
    expect(out.confidenceSource).toBe("strength_from_signal");
  });

  it("rawConfidence == 1.0 with low strength stays Medium (degenerate_default source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          confidence: 1.0,
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.signalStrength).toBeLessThan(0.3);
    expect(out.confidence).toBe("Medium");
    expect(out.confidenceSource).toBe("degenerate_default");
  });

  it("non-degenerate rawConfidence still drives High when alignment is full (raw_confidence source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          confidence: 0.85,
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidence).toBe("High");
    expect(out.confidenceSource).toBe("raw_confidence");
  });

  it("conflict alignment surfaces alignment_only source", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        timeframeAlignment: "conflict",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bearish",
          longTermSignal: "neutral",
          confidence: 0.95,
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidence).toBe("Low");
    expect(out.confidenceSource).toBe("alignment_only");
  });

  it("missing rawConfidence falls through to alignment_only Medium", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
        },
      }),
    });
    const out = deriveSignals(truth);
    expect(out.confidenceSource).toBe("alignment_only");
  });
});

// ── composeBrief (interpretation seam) ──────────────────────────────

describe("composeBrief — interpretation seam contract", () => {
  it("only depends on truth, derived, mode, now (no extra args)", () => {
    const truth: BriefTruth = gatherTruth({ signal: makeStockSignal() });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(typeof out.whatHappening).toBe("string");
    // No analysisDate and no `now` override -> updatedAt is null per A5.
    expect(out.updatedAt).toBeNull();
  });

  it("strict mode: never appends memory text to whatHappening", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: memoryHighImpact,
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived, mode: "strict" });
    expect(out.whatHappening).not.toContain("analyst day");
  });

  it("blended mode: appends memory phrase only when impact gate passes", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: memoryHighImpact,
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived, mode: "blended" });
    expect(out.whatHappening).toContain("analyst day");
  });

  it("blended mode: skips appending when impact is medium (gate requires high+)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      memoryText: { ...memoryHighImpact, impactLevel: "medium" },
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived, mode: "blended" });
    expect(out.whatHappening).not.toContain("analyst day");
  });

  it("uses dataAsOf for updatedAt when no override is supplied", () => {
    const truth = gatherTruth({
      signal: makeStockSignal(),
      analysisDate: "2026-05-08",
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    // 2026-05-08 21:00 UTC -> still resolves to May 8 in ET formatter
    const iso = out.updatedAt!.toISOString();
    expect(iso.slice(0, 10)).toBe("2026-05-08");
  });

  it("override now wins over dataAsOf", () => {
    const fixed = new Date("2026-01-01T00:00:00Z");
    const truth = gatherTruth({
      signal: makeStockSignal(),
      analysisDate: "2026-05-08",
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived, now: fixed });
    expect(out.updatedAt!.toISOString()).toBe(fixed.toISOString());
  });
});

// ── Crypto-coverage smoke ───────────────────────────────────────────

describe("composeBrief — crypto coverage", () => {
  it("preserves slash-stripped ticker only at the brief layer (truth keeps original)", () => {
    const truth = gatherTruth({ signal: makeCryptoSignal() });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(truth.symbol).toBe("BTC/USD");
    expect(out.whatHappening).toContain("BTC ");
  });
});

// ── deriveStrengthFromTruth ─────────────────────────────────────────

describe("deriveStrengthFromTruth", () => {
  it("entry_zone: strength = 1 when price is at zone midpoint", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 173,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          entryHigh: 178,
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBeCloseTo(1.0, 1);
  });

  it("entry_zone: strength decreases toward zone edges", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 178,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          entryHigh: 178,
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBeCloseTo(0.0, 1);
  });

  it("target_reached: strength = 0 when no target level", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 195,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBe(0);
  });

  it("target_reached: strength > 0 when price is near target", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 200,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          targetPrice: 195,
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBeGreaterThan(0);
    expect(deriveStrengthFromTruth(truth)).toBeLessThanOrEqual(1);
  });

  it("news_sentiment: strength = count*|avg|/8 capped at 1", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 8,
          newsAvgSentiment: 0.8,
          newsSentimentLabel: "bullish",
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBeCloseTo(0.8, 2);
  });

  it("signal_change: full flip (bearish->bullish) yields strength 1.0", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "signal_change",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          previousSignal: "bearish",
          currentSignal: "bullish",
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBe(1.0);
  });

  it("notable_pattern: uses patternConfidence when available", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "notable_pattern",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          patterns: [
            { pattern: "bullish_engulfing", confidence: 0.92, signal: "bullish" },
          ],
        },
      }),
    });
    expect(deriveStrengthFromTruth(truth)).toBe(0.92);
  });
});

// ── trimContextLine ─────────────────────────────────────────────────

describe("trimContextLine", () => {
  it("returns text unchanged when under 180 chars", () => {
    const short = "A short context line.";
    expect(trimContextLine(short)).toEqual({ text: short, trimmed: false });
  });

  it("trims at a sentence boundary within 180 chars", () => {
    const first = "First sentence here.";
    const rest = " " + "X".repeat(200);
    const long = first + rest;
    const result = trimContextLine(long);
    expect(result.trimmed).toBe(true);
    expect(result.text).toBe(first);
  });

  it("falls back to hard cut at 160 chars with ellipsis when no sentence boundary", () => {
    const noStop = "A".repeat(200);
    const result = trimContextLine(noStop);
    expect(result.trimmed).toBe(true);
    expect(result.text).toBe("A".repeat(160) + "…");
    expect(result.text.length).toBe(161);
  });
});

// ── fresh-hit vs materially-beyond copy ─────────────────────────────

describe("composeBrief — target_reached copy adaptation", () => {
  it("uses 'pushed to' for fresh hit (price within 3% of target)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 201,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          targetPrice: 200,
        },
      }),
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(out.whatHappening).toMatch(/pushed to/);
    expect(out.whatHappening).not.toMatch(/above its projected target/);
  });

  it("uses 'trading at X% above' for materially-beyond (price >3% above target)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 210,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          targetPrice: 200,
        },
      }),
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(out.whatHappening).toMatch(/above its projected target/);
    expect(out.whatHappening).toMatch(/~5\.0%/);
  });
});

describe("composeBrief — stop_loss_warning copy adaptation", () => {
  it("uses 'pressing' for price near stop (within 3%)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "stop_loss_warning",
        rawData: {
          close: 89,
          daySignal: "bearish",
          swingSignal: "bearish",
          longTermSignal: "bearish",
          stopLoss: 90,
        },
      }),
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(out.whatHappening).toMatch(/pressing the stop-loss/);
    expect(out.whatHappening).not.toMatch(/below its stop level/);
  });

  it("uses 'trading at X% below' for materially-below (price >3% below stop)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "stop_loss_warning",
        rawData: {
          close: 85,
          daySignal: "bearish",
          swingSignal: "bearish",
          longTermSignal: "bearish",
          stopLoss: 100,
        },
      }),
    });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(out.whatHappening).toMatch(/below its stop level/);
    expect(out.whatHappening).toMatch(/~15\.0%/);
  });
});

// ── watchCategory ────────────────────────────────────────────────────

describe("deriveSignals — watchCategory", () => {
  it("entry_zone -> setup", () => {
    const truth = gatherTruth({ signal: makeStockSignal({ type: "entry_zone" }) });
    expect(deriveSignals(truth).watchCategory).toBe("setup");
  });

  it("target_reached -> breakout", () => {
    const truth = gatherTruth({ signal: makeCryptoSignal({ type: "target_reached" }) });
    expect(deriveSignals(truth).watchCategory).toBe("breakout");
  });

  it("stop_loss_warning -> defensive", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "stop_loss_warning",
        rawData: {
          close: 163,
          daySignal: "bearish",
          swingSignal: "bearish",
          longTermSignal: "neutral",
          entryLow: 168,
          stopLoss: 162,
        },
      }),
    });
    expect(deriveSignals(truth).watchCategory).toBe("defensive");
  });

  it("momentum_shift -> setup (default)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({ type: "momentum_shift" }),
    });
    expect(deriveSignals(truth).watchCategory).toBe("setup");
  });
});

// ── fmtPrice unification (commas for >= 10k) ────────────────────────

describe("deriveSignals — fmtPrice commas for levels >= 10k", () => {
  it("crypto levels get comma separators", () => {
    const truth = gatherTruth({ signal: makeCryptoSignal() });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("74,900");
    expect(d.breakBelowTarget).toBe("73,500");
  });

  it("stock levels under 10k keep decimals", () => {
    // makeStockSignal default: ema20=171 (tighter than entryLow=168) wins
    // for hold; stopLoss=162 stays as break.
    const truth = gatherTruth({ signal: makeStockSignal() });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("171.00");
    expect(d.breakBelowTarget).toBe("162.00");
  });
});

// ── Distance sanity guard ────────────────────────────────────────────

describe("deriveSignals — distance sanity guard", () => {
  it("default-branch anchor already resolves the 'both far' case when ema20 is available", () => {
    // With the post-fix default cascade, hold = max(entryLow=70, ema20=98)
    // = 98 (ema20, ~2% from spot). The both-sides 20% guard is no longer
    // the mechanism that rescues this case — it's resolved by the anchor.
    // Note: the single-side polish (Rule A) does drop break=65 (-35%)
    // because hold is inside 25% — see the dedicated section below.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 70,
          stopLoss: 65,
          ema20: 98,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("98.00");
    expect(d.breakBelowTarget).toBe("—");
  });

  it("does NOT collapse to em-dash when only one level is within 20% (single-side polish handles break-far)", () => {
    // entryLow=85 (-15%, inside 20%), stopLoss=65 (-35%, outside 20%).
    // Both-sides guard does not fire. Hold is preserved; the single-side
    // polish drops the far break — see the dedicated section below for
    // that assertion.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 85,
          stopLoss: 65,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("85.00");
    // Single-side break-far rule (>25%) suppresses break — see
    // "single-side distance polish" describe block.
    expect(d.breakBelowTarget).toBe("—");
  });

  it("preserves hold=em-dash when ema20 also missing in distance fallback", () => {
    // GOLD-style case: structural levels are far (>20%) and there is no
    // ema20 to fall back to — both anchors collapse to em-dash.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 70,
          stopLoss: 65,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("—");
    expect(d.breakBelowTarget).toBe("—");
  });

  it("real-world NVDA shape: price 214, entryLow 184, stopLoss 182, ema20 210 → hold=210, break=182", () => {
    // Reproduces the symptom from the live screenshot. After the fix:
    // hold anchors to ema20 (~2% from spot) and break preserves stopLoss
    // (~15% — the wider structural invalidation).
    const truth = gatherTruth({
      signal: makeStockSignal({
        symbol: "NVDA",
        type: "entry_zone",
        rawData: {
          close: 214,
          latestOpen: 212,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 184,
          stopLoss: 182,
          ema20: 210,
          periodLow: 180,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("210.00");
    expect(d.breakBelowTarget).toBe("182.00");
  });
});

// ── Single-side distance polish (Rule A + Rule B) ────────────────────

describe("deriveSignals — single-side distance polish", () => {
  // Rule A: hold anchored within 25%, break > 25% from spot → break dropped

  it("Rule A: target_reached extension drops break-far (AMD-style)", () => {
    // AMD-style live shape: price=490, target=396 (~-19%, inside 25%),
    // ema20=234 (~-52%, outside 25%). Pre-polish: break=234. Polished:
    // hold=396 preserved, break dropped to em-dash so the renderer
    // shows the single-line "Key level to watch:" form.
    const truth = gatherTruth({
      signal: makeStockSignal({
        symbol: "AMD",
        type: "target_reached",
        rawData: {
          close: 490,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          targetPrice: 396,
          ema20: 234,
          stopLoss: 269,
          entryLow: 272,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("396.00");
    expect(d.breakBelowTarget).toBe("—");
  });

  it("Rule A: default-branch break-far suppression (UNH-style stopLoss too far)", () => {
    // Spot=100. ema20=95 (-5%, inside 25%). entryLow=85 (-15%, inside).
    // stopLoss=70 (-30%, outside 25%). Hold=max(85,95)=95 anchored
    // within 25% → break (stopLoss=70) suppressed by single-side rule.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 85,
          stopLoss: 70,
          ema20: 95,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("95.00");
    expect(d.breakBelowTarget).toBe("—");
  });

  it("Rule A no-op: both levels within 25% (healthy setup unchanged)", () => {
    // Spot=100. entryLow=90 (-10%), ema20=95 (-5%), stopLoss=80 (-20%).
    // Hold=95, break=80. Both inside 25% → Rule A skips, both shown.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 90,
          stopLoss: 80,
          ema20: 95,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("95.00");
    expect(d.breakBelowTarget).toBe("80.00");
  });

  it("Rule A no-op when hold is also far (yields to existing both-sides 20% guard)", () => {
    // Spot=100. entryLow=70, stopLoss=65, ema20=72. Default-branch
    // hold=max(70,72)=72 (-28%). Both >20% → both-sides guard fires
    // first and degrades to ema20-only — Rule A never sees a
    // hold-inside scenario.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 70,
          stopLoss: 65,
          ema20: 72,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("72.00");
    expect(d.breakBelowTarget).toBe("—");
  });

  // Rule B: default-branch hold > 25% above spot → swap to closer alternate

  it("Rule B: swaps hold to entryLow when ema20 sits >25% above spot and entryLow is closer", () => {
    // Spot=100. entryLow=98 (-2%, just below spot), ema20=130 (+30%
    // above spot), stopLoss=80 (-20%). Pre-polish:
    // hold=max(98,130)=130 (+30% above). Polished: ema20 is far above
    // spot, entryLow=98 is closer AND > break — swap to entryLow.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 98,
          stopLoss: 80,
          ema20: 130,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("98.00");
    expect(d.breakBelowTarget).toBe("80.00");
  });

  it("Rule B no-op: target_reached is exempt", () => {
    // target_reached has its own anchoring semantic (max(target,
    // ema20)) — we deliberately leave it alone even when hold lands
    // far above spot, because the breakout wording handles a far hold
    // differently and the upstream signal logic owns that decision.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "target_reached",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          targetPrice: 130,
          ema20: 95,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("130.00");
    // 95 is -5% from spot, within both 20% and 25%, so break preserved.
    expect(d.breakBelowTarget).toBe("95.00");
  });

  it("Rule B no-op: hold below spot (entryLow above ema20, both below spot)", () => {
    // Spot=100. entryLow=95 (-5%), ema20=92 (-8%). Pre-polish:
    // hold=max(95,92)=95 (below spot). Rule B requires hold > spot —
    // doesn't fire.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 95,
          stopLoss: 88,
          ema20: 92,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("95.00");
    expect(d.breakBelowTarget).toBe("88.00");
  });

  it("Rule B no-op: alternate would invert with break (hold stays put)", () => {
    // Spot=100. entryLow=70 (would invert with stopLoss=80), ema20=130
    // (+30% above spot). Pre-polish: hold=130. Polished: entryLow=70
    // is closer to spot but <= break=80 → invariant violated, no swap.
    // ema20 is the current hold so it can't substitute itself. No
    // valid alternate → hold preserved.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 70,
          stopLoss: 80,
          ema20: 130,
        },
      }),
    });
    const d = deriveSignals(truth);
    // No substitution possible. The hold (130) is also outside the 25%
    // band above spot, but Rule A doesn't suppress (break 80 is inside).
    expect(d.holdAbove).toBe("130.00");
    expect(d.breakBelowTarget).toBe("80.00");
  });

  it("Rule B firing leaves break untouched when break is already anchored", () => {
    // Spot=100. entryLow=98 (-2%), ema20=130 (+30%), stopLoss=85 (-15%).
    // Pre-polish: hold = max(98,130) = 130, break = stopLoss = 85.
    // Both-sides 20% guard: hold 30% / break 15% → not both >20%, skip.
    // Rule A: hold not inside 25% → skip.
    // Rule B: hold > spot, dist 30% > 25% → swap to entryLow=98 (closer
    //   to spot AND > break=85). Break preserved.
    const truth = gatherTruth({
      signal: makeStockSignal({
        type: "entry_zone",
        rawData: {
          close: 100,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 98,
          stopLoss: 85,
          ema20: 130,
        },
      }),
    });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("98.00");
    expect(d.breakBelowTarget).toBe("85.00");
  });
});
