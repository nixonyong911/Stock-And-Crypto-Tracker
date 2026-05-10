import { describe, it, expect } from "vitest";
import {
  gatherTruth,
  deriveSignals,
  composeBrief,
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
  it("uses stopLoss for breakBelowTarget and entryLow for holdAbove", () => {
    const truth = gatherTruth({ signal: makeStockSignal() });
    const d = deriveSignals(truth);
    expect(d.holdAbove).toBe("168.00");
    expect(d.breakBelowTarget).toBe("162.00");
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
    expect(deriveSignals(periodLowTruth).holdAbove).toBe("168.00");

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

  it("news_sentiment: count*|avg| >= 6 -> High (count_avg source)", () => {
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
    expect(out.confidenceSource).toBe("news_count_avg");
  });

  it("news_sentiment: count*|avg| in [4, 6) -> Medium (count_avg source)", () => {
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
    expect(out.confidenceSource).toBe("news_count_avg");
  });

  it("news_sentiment: count*|avg| < 4 -> Low even with many articles (count_avg source)", () => {
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
    expect(out.confidenceSource).toBe("news_count_avg");
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

  it("rawConfidence == 1.0 is treated as degenerate and downgraded to Medium (degenerate_default source)", () => {
    const truth = gatherTruth({
      signal: makeStockSignal({
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
    const iso = out.updatedAt.toISOString();
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
    expect(out.updatedAt.toISOString()).toBe(fixed.toISOString());
  });
});

// ── Crypto-coverage smoke ───────────────────────────────────────────

describe("composeBrief — crypto coverage", () => {
  it("preserves slash-stripped ticker only at the brief layer (truth keeps original)", () => {
    const truth = gatherTruth({ signal: makeCryptoSignal() });
    const derived = deriveSignals(truth);
    const out = composeBrief({ truth, derived });
    expect(truth.symbol).toBe("BTC/USD");
    // baseSignalSentence uses displaySymbol -> BTC.
    expect(out.whatHappening).toContain("BTC ");
  });
});
