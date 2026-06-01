import { describe, it, expect } from "vitest";
import {
  deriveStance,
  deriveConfidence,
  buildWhatHappening,
  buildWhatToWatch,
  buildContext,
  generateDigestBrief,
  type DigestBrief,
} from "../digest-brief-generator.js";
import type {
  TickerSignal,
  MacroContext,
} from "../recommendation-engine.js";

function makeSignal(overrides: Partial<TickerSignal> = {}): TickerSignal {
  return {
    symbol: "AAPL",
    assetType: "stock",
    type: "entry_zone",
    priority: "high",
    timeframeAlignment: "full",
    headline: "AAPL is near its entry zone",
    rawData: {
      close: 175,
      latestOpen: 170,
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
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

describe("deriveStance", () => {
  it('returns "Watch zone" for entry_zone signals', () => {
    expect(deriveStance(makeSignal({ type: "entry_zone" }))).toEqual({
      label: "Watch zone",
      tone: "watch",
    });
  });

  it('returns "Watch zone" for notable_pattern signals', () => {
    expect(deriveStance(makeSignal({ type: "notable_pattern" }))).toEqual({
      label: "Watch zone",
      tone: "watch",
    });
  });

  it('returns "Watch zone" for news_sentiment signals', () => {
    expect(deriveStance(makeSignal({ type: "news_sentiment" }))).toEqual({
      label: "Watch zone",
      tone: "watch",
    });
  });

  it('returns "Constructive" for target_reached signals', () => {
    expect(deriveStance(makeSignal({ type: "target_reached" }))).toEqual({
      label: "Constructive",
      tone: "trigger",
    });
  });

  it('returns "Constructive" for bullish signal_change', () => {
    const s = makeSignal({
      type: "signal_change",
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        previousSignal: "bearish",
        currentSignal: "bullish",
      },
    });
    expect(deriveStance(s)).toEqual({ label: "Constructive", tone: "trigger" });
  });

  it('returns "Caution" for stop_loss_warning signals', () => {
    expect(deriveStance(makeSignal({ type: "stop_loss_warning" }))).toEqual({
      label: "Caution",
      tone: "watch",
    });
  });

  it('returns "Caution" for bearish signal_change', () => {
    const s = makeSignal({
      type: "signal_change",
      rawData: {
        close: 175,
        daySignal: "bearish",
        swingSignal: "bearish",
        longTermSignal: "bearish",
        previousSignal: "bullish",
        currentSignal: "bearish",
      },
    });
    expect(deriveStance(s)).toEqual({ label: "Caution", tone: "watch" });
  });

  it('returns "Caution" on conflict alignment regardless of type', () => {
    const s = makeSignal({
      type: "target_reached",
      timeframeAlignment: "conflict",
    });
    expect(deriveStance(s)).toEqual({ label: "Caution", tone: "watch" });
  });

  it('returns "Constructive" for positive momentum_shift', () => {
    const s = makeSignal({
      type: "momentum_shift",
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        macdHistogram: 0.5,
      },
    });
    expect(deriveStance(s)).toEqual({ label: "Constructive", tone: "trigger" });
  });

  it('returns "Caution" for negative momentum_shift', () => {
    const s = makeSignal({
      type: "momentum_shift",
      rawData: {
        close: 175,
        daySignal: "bearish",
        swingSignal: "bearish",
        longTermSignal: "bearish",
        macdHistogram: -0.5,
      },
    });
    expect(deriveStance(s)).toEqual({ label: "Caution", tone: "watch" });
  });
});

describe("deriveConfidence", () => {
  it('returns "Low" on conflict alignment', () => {
    expect(
      deriveConfidence(makeSignal({ timeframeAlignment: "conflict" })),
    ).toBe("Low");
  });

  it('returns "Low" when raw confidence < 0.4', () => {
    const s = makeSignal({
      timeframeAlignment: "partial",
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        confidence: 0.3,
      },
    });
    expect(deriveConfidence(s)).toBe("Low");
  });

  it('returns "High" when confidence >= 0.7 with full alignment', () => {
    const s = makeSignal({
      timeframeAlignment: "full",
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        confidence: 0.85,
      },
    });
    expect(deriveConfidence(s)).toBe("High");
  });

  it('collapses what was Low-Medium to "Medium" with high confidence + partial alignment', () => {
    const s = makeSignal({
      timeframeAlignment: "partial",
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        confidence: 0.85,
      },
    });
    expect(deriveConfidence(s)).toBe("Medium");
  });

  it('returns "Medium" for news_sentiment with >= 7 articles', () => {
    const s = makeSignal({
      type: "news_sentiment",
      rawData: {
        close: 175,
        daySignal: "neutral",
        swingSignal: "neutral",
        longTermSignal: "neutral",
        newsArticleCount: 8,
      },
    });
    expect(deriveConfidence(s)).toBe("Medium");
  });

  it('returns "Low" for news_sentiment with < 7 articles', () => {
    const s = makeSignal({
      type: "news_sentiment",
      rawData: {
        close: 175,
        daySignal: "neutral",
        swingSignal: "neutral",
        longTermSignal: "neutral",
        newsArticleCount: 4,
      },
    });
    expect(deriveConfidence(s)).toBe("Low");
  });
});

describe("buildWhatHappening", () => {
  it("emits a one-line, fact-rich entry-zone sentence (B5)", () => {
    const out = buildWhatHappening(
      makeSignal({
        type: "entry_zone",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          entryHigh: 178,
          stopLoss: 162,
        },
      }),
    );
    expect(out).toMatch(/AAPL is back inside its entry zone at \$175\.00/);
    expect(out).toMatch(/zone \$168\.00.\$178\.00/);
    expect(out).toMatch(/stop at \$162\.00/);
    // One-line semantic: a single trailing terminator, no embedded
    // sentence breaks (decimal points in prices don't count).
    expect(out.split(/[.!?]\s/).filter((s) => s.trim().length > 0)).toHaveLength(1);
    expect(out).not.toContain("\n");
  });

  it("never emits the legacy 'across all timeframes' filler", () => {
    for (const type of [
      "entry_zone",
      "target_reached",
      "stop_loss_warning",
      "signal_change",
      "momentum_shift",
      "notable_pattern",
      "news_sentiment",
    ] as const) {
      const out = buildWhatHappening(makeSignal({ type }));
      expect(out).not.toMatch(/across all timeframes/i);
    }
  });

  // ── B5 fact-rich composition ────────────────────────────────────

  it("target_reached weaves price + target", () => {
    const out = buildWhatHappening(
      makeSignal({
        type: "target_reached",
        rawData: {
          close: 195,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          targetPrice: 192,
        },
      }),
    );
    expect(out).toMatch(/\$195\.00/);
    expect(out).toMatch(/\$192\.00/);
  });

  it("stop_loss_warning weaves price + stop level", () => {
    const out = buildWhatHappening(
      makeSignal({
        type: "stop_loss_warning",
        rawData: {
          close: 90,
          daySignal: "bearish",
          swingSignal: "bearish",
          longTermSignal: "bearish",
          stopLoss: 89,
        },
      }),
    );
    expect(out).toMatch(/\$90\.00/);
    expect(out).toMatch(/stop-loss at \$89\.00/);
  });

  it("signal_change includes prev/curr direction and price", () => {
    const out = buildWhatHappening(
      makeSignal({
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
    );
    expect(out).toMatch(/from bearish to bullish/);
    expect(out).toMatch(/\$175\.00/);
  });

  it("momentum_shift surfaces the macd histogram value", () => {
    const out = buildWhatHappening(
      makeSignal({
        type: "momentum_shift",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          macdHistogram: 0.0234,
        },
      }),
    );
    expect(out).toMatch(/positive/);
    expect(out).toMatch(/0\.0234/);
  });

  it("notable_pattern includes derived confidence bucket", () => {
    const out = buildWhatHappening(
      makeSignal({
        type: "notable_pattern",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          confidence: 0.85,
          patterns: [
            { pattern: "bullish_engulfing", confidence: 0.85, signal: "bullish" },
          ],
        },
      }),
    );
    expect(out).toMatch(/Bullish engulfing/);
    expect(out).toMatch(/high-confidence/);
  });

  it("news_sentiment weaves count + average sentiment", () => {
    const out = buildWhatHappening(
      makeSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 8,
          newsAvgSentiment: 0.62,
          newsSentimentLabel: "bullish",
        },
      }),
    );
    expect(out).toMatch(/skewed bullish across 8 stories/);
    expect(out).toMatch(/avg \+0\.62/);
  });
});

describe("buildWhatToWatch", () => {
  it("uses entryLow as holdAbove and stopLoss as breakBelowTarget when both present", () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        entryLow: 170,
        entryHigh: 178,
        stopLoss: 165,
      },
    });
    const out = buildWhatToWatch(s);
    expect(out.holdAbove).toBe("170.00");
    expect(out.breakBelowTarget).toBe("165.00");
  });

  it("falls back to periodLow then ema20 for holdAbove", () => {
    // When both periodLow and ema20 are present in the default branch,
    // the post-fix cascade picks the tighter one (max → closer to spot).
    // periodLow=168, ema20=172 → ema20 wins.
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        periodLow: 168,
        ema20: 172,
      },
    });
    expect(buildWhatToWatch(s).holdAbove).toBe("172.00");

    // periodLow only (no ema20) → cascade returns periodLow.
    const periodLowOnly = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        periodLow: 168,
      },
    });
    expect(buildWhatToWatch(periodLowOnly).holdAbove).toBe("168.00");
  });

  it("returns em-dash for breakBelowTarget when stopLoss missing (no *0.97 invention)", () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        periodLow: 168,
      },
    });
    expect(buildWhatToWatch(s).breakBelowTarget).toBe("—");
  });

  it("returns em-dash for both when no DB levels are available (no close fallback)", () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
      },
    });
    const out = buildWhatToWatch(s);
    expect(out.holdAbove).toBe("—");
    expect(out.breakBelowTarget).toBe("—");
  });
});

describe("buildContext", () => {
  it("prefers a non-empty news one-liner", () => {
    const out = buildContext(makeSignal(), macroSupportive, "Earnings beat lifts mood.");
    expect(out).toEqual({
      context: "Earnings beat lifts mood.",
      hasMaterialContext: true,
    });
  });

  it("falls back to a strong macro theme", () => {
    const out = buildContext(makeSignal(), macroSupportive, undefined);
    expect(out.hasMaterialContext).toBe(true);
    expect(out.context).toContain("macro");
    expect(out.context).toContain("supportive");
  });

  it("returns empty when neither news nor strong macro is available", () => {
    const out = buildContext(makeSignal(), macroNeutral, undefined);
    expect(out).toEqual({ context: "", hasMaterialContext: false });
  });

  it("returns empty when news one-liner is whitespace only", () => {
    const out = buildContext(makeSignal(), macroNeutral, "   ");
    expect(out).toEqual({ context: "", hasMaterialContext: false });
  });
});

describe("generateDigestBrief", () => {
  it("returns a complete DigestBrief that mirrors CardData fields", () => {
    const s = makeSignal();
    const brief: DigestBrief = generateDigestBrief({
      signals: [s],
      symbol: "AAPL",
      macroContext: macroNeutral,
    });

    expect(brief.ticker).toBe("AAPL");
    expect(brief.status).toEqual({ label: "Watch zone", tone: "watch" });
    expect(brief.price).toBe(175);
    expect(brief.changePercent).toBeCloseTo(((175 - 170) / 170) * 100, 5);
    expect(brief.confidence).toBe("Medium");
    // No analysisDateMap and no `now` override -> updatedAt is null per A5
    // (the renderer surfaces this as "data unavailable").
    expect(brief.updatedAt).toBeNull();
    expect(brief.whatHappening.length).toBeGreaterThan(0);
    expect(brief.whatToWatch.holdAbove).toBeTruthy();
    expect(brief.whatToWatch.breakBelowTarget).toBeTruthy();
    expect(brief.context).toBe("");
    expect(brief.hasMaterialContext).toBe(false);
  });

  it("strips /USD from crypto symbols in the ticker output", () => {
    const s = makeSignal({ symbol: "BTC/USD" });
    const brief = generateDigestBrief({ signals: [s], symbol: "BTC/USD" });
    expect(brief.ticker).toBe("BTC");
  });

  it("uses the highest-priority signal as the dominant driver", () => {
    const low = makeSignal({
      type: "notable_pattern",
      priority: "low",
      headline: "low pri",
    });
    const high = makeSignal({
      type: "target_reached",
      priority: "high",
      headline: "high pri",
    });
    const brief = generateDigestBrief({
      signals: [low, high],
      symbol: "AAPL",
    });
    expect(brief.status.label).toBe("Constructive");
  });

  it("returns a Neutral fallback brief when there are no signals", () => {
    const brief = generateDigestBrief({ signals: [], symbol: "AAPL" });
    expect(brief.status).toEqual({ label: "Neutral", tone: "neutral" });
    expect(brief.confidence).toBe("Low");
    expect(brief.price).toBe(0);
    expect(brief.changePercent).toBe(0);
    expect(brief.context).toBe("");
    expect(brief.hasMaterialContext).toBe(false);
  });

  describe("selectPrimary deterministic tiebreak (B4)", () => {
    it("prefers higher-strength signal at equal priority (strength tiebreak)", () => {
      const stop = makeSignal({
        type: "stop_loss_warning",
        priority: "medium",
        headline: "stop",
        rawData: {
          close: 80,
          daySignal: "bearish",
          swingSignal: "bearish",
          longTermSignal: "bearish",
          stopLoss: 89,
        },
      });
      const entry = makeSignal({
        type: "entry_zone",
        priority: "medium",
        headline: "entry",
      });
      const brief = generateDigestBrief({
        signals: [entry, stop],
        symbol: "AAPL",
      });
      expect(brief.status.label).toBe("Caution");
    });

    it("prefers target_reached over stop_loss_warning at equal priority", () => {
      const stop = makeSignal({
        type: "stop_loss_warning",
        priority: "high",
        headline: "stop",
      });
      const target = makeSignal({
        type: "target_reached",
        priority: "high",
        headline: "target",
      });
      const brief = generateDigestBrief({
        signals: [stop, target],
        symbol: "AAPL",
      });
      expect(brief.status.label).toBe("Constructive");
    });

    it("is order-independent for equal priority + equal type (input order does not change winner)", () => {
      const a = makeSignal({
        symbol: "AAPL",
        type: "entry_zone",
        priority: "medium",
        headline: "AAPL entry",
      });
      const b = makeSignal({
        symbol: "MSFT",
        type: "entry_zone",
        priority: "medium",
        headline: "MSFT entry",
      });
      const briefAB = generateDigestBrief({ signals: [a, b], symbol: "AAPL" });
      const briefBA = generateDigestBrief({ signals: [b, a], symbol: "AAPL" });
      expect(briefAB.ticker).toBe(briefBA.ticker);
    });

    it("priority still wins over type rank (high signal_change beats medium target_reached)", () => {
      const lowImpactTarget = makeSignal({
        type: "target_reached",
        priority: "medium",
        headline: "medium target",
      });
      const highSignalChange = makeSignal({
        type: "signal_change",
        priority: "high",
        rawData: {
          close: 175,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          previousSignal: "bearish",
          currentSignal: "bullish",
        },
        headline: "high signal change",
      });
      const brief = generateDigestBrief({
        signals: [lowImpactTarget, highSignalChange],
        symbol: "AAPL",
      });
      expect(brief.status.label).toBe("Constructive");
    });
  });

  it("computes changePercent = 0 when latestOpen is missing", () => {
    const s = makeSignal({
      rawData: {
        close: 200,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
      },
    });
    const brief = generateDigestBrief({ signals: [s], symbol: "AAPL" });
    expect(brief.changePercent).toBe(0);
  });

  it("populates context from the news one-liner map (non-news_sentiment signal)", () => {
    const s = makeSignal({ type: "entry_zone" });
    const brief = generateDigestBrief({
      signals: [s],
      symbol: "AAPL",
      newsOneLinerMap: new Map([["AAPL", "Strong services guidance."]]),
    });
    expect(brief.context).toBe("Strong services guidance.");
    expect(brief.hasMaterialContext).toBe(true);
  });

  it("does NOT use the news one-liner for news_sentiment signals (signal already carries the news)", () => {
    const s = makeSignal({
      type: "news_sentiment",
      rawData: {
        close: 175,
        daySignal: "neutral",
        swingSignal: "neutral",
        longTermSignal: "neutral",
        newsArticleCount: 6,
        newsSentimentLabel: "bullish",
      },
    });
    const brief = generateDigestBrief({
      signals: [s],
      symbol: "AAPL",
      newsOneLinerMap: new Map([["AAPL", "should be ignored"]]),
    });
    expect(brief.context).not.toBe("should be ignored");
  });

  describe("sparse-data defensive fallback", () => {
    it("renders em-dash levels and zero price when rawData.close is 0 (legacy stub)", () => {
      const s = makeSignal({
        type: "news_sentiment",
        rawData: {
          close: 0,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 3,
          newsSentimentLabel: "bearish",
        },
      });
      const brief = generateDigestBrief({ signals: [s], symbol: "AAPL" });

      expect(brief.price).toBe(0);
      expect(brief.changePercent).toBe(0);
      expect(brief.whatToWatch.holdAbove).toBe("—");
      expect(brief.whatToWatch.breakBelowTarget).toBe("—");
      expect(brief.whatHappening).toMatch(/coverage/i);
      expect(brief.status.label).toBe("Watch zone");
    });

    it("renders em-dash levels when close is non-finite (NaN)", () => {
      const s = makeSignal({
        rawData: {
          close: Number.NaN,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
        },
      });
      const brief = generateDigestBrief({ signals: [s], symbol: "AAPL" });

      expect(brief.price).toBe(0);
      expect(brief.whatToWatch.holdAbove).toBe("—");
      expect(brief.whatToWatch.breakBelowTarget).toBe("—");
    });

    it("uses real values when close is a positive finite number", () => {
      const s = makeSignal({
        rawData: {
          close: 175,
          latestOpen: 170,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          stopLoss: 162,
        },
      });
      const brief = generateDigestBrief({ signals: [s], symbol: "AAPL" });

      expect(brief.price).toBe(175);
      expect(brief.whatToWatch.holdAbove).toBe("168.00");
      expect(brief.whatToWatch.breakBelowTarget).toBe("162.00");
    });
  });

  describe("DB-truth-driven updatedAt", () => {
    it("uses analysisDateMap value when supplied", () => {
      const s = makeSignal();
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        analysisDateMap: new Map([["AAPL", "2026-05-08"]]),
      });
      expect(brief.updatedAt!.toISOString().slice(0, 10)).toBe("2026-05-08");
    });

    it("now arg overrides analysisDateMap", () => {
      const fixed = new Date("2026-01-01T00:00:00Z");
      const s = makeSignal();
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        analysisDateMap: new Map([["AAPL", "2026-05-08"]]),
        now: fixed,
      });
      expect(brief.updatedAt!.toISOString()).toBe(fixed.toISOString());
    });
  });

  describe("memoryTextMap and strict context gating", () => {
    it("emits context when memoryTextMap row passes impact/relevance gate", () => {
      const s = makeSignal({ type: "entry_zone" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              newsOneLiner: "Strong services guidance.",
              impactLevel: "high",
              relevanceScore: 0.8,
              // Fresh — passes the B1 freshness gate.
              lastUpdated: new Date().toISOString(),
            },
          ],
        ]),
      });
      expect(brief.context).toBe("Strong services guidance.");
      expect(brief.hasMaterialContext).toBe(true);
    });

    it("omits context when memoryTextMap row has impactLevel='low'", () => {
      const s = makeSignal({ type: "entry_zone" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              newsOneLiner: "Should be omitted",
              impactLevel: "low",
              relevanceScore: 0.95,
            },
          ],
        ]),
      });
      expect(brief.context).toBe("");
      expect(brief.hasMaterialContext).toBe(false);
    });

    it("ignores memory for news_sentiment signals (news already in whatHappening)", () => {
      const s = makeSignal({
        type: "news_sentiment",
        rawData: {
          close: 175,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          newsArticleCount: 6,
          newsSentimentLabel: "bullish",
        },
      });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              newsOneLiner: "Should be ignored",
              impactLevel: "high",
              relevanceScore: 0.9,
            },
          ],
        ]),
      });
      expect(brief.context).not.toBe("Should be ignored");
    });
  });

  describe("strict vs blended whatHappening modes", () => {
    it("strict (default) does not surface memory.summary in whatHappening", () => {
      const s = makeSignal({ type: "entry_zone" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              summary: "Distinct memory phrase about Apple analyst day.",
              impactLevel: "high",
              relevanceScore: 0.8,
            },
          ],
        ]),
      });
      expect(brief.whatHappening).not.toContain("analyst day");
    });

    it("blended appends memory.summary phrase when impact gate passes", () => {
      const s = makeSignal({ type: "entry_zone" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        mode: "blended",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              summary: "Distinct memory phrase about Apple analyst day.",
              impactLevel: "high",
              relevanceScore: 0.8,
              // Fresh — passes the B1 freshness gate.
              lastUpdated: new Date().toISOString(),
            },
          ],
        ]),
      });
      expect(brief.whatHappening).toContain("analyst day");
    });

    it("rejects memoryTextMap row that is older than 72h (B1 freshness gate)", () => {
      const s = makeSignal({ type: "entry_zone" });
      const stale = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              newsOneLiner: "Stale services guidance.",
              impactLevel: "high",
              relevanceScore: 0.95,
              lastUpdated: stale,
            },
          ],
        ]),
      });
      expect(brief.context).toBe("");
      expect(brief.hasMaterialContext).toBe(false);
    });

    it("rejects memoryTextMap row with no lastUpdated (B1 freshness gate)", () => {
      const s = makeSignal({ type: "entry_zone" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              newsOneLiner: "Undated services guidance.",
              impactLevel: "high",
              relevanceScore: 0.95,
            },
          ],
        ]),
      });
      expect(brief.context).toBe("");
      expect(brief.hasMaterialContext).toBe(false);
    });

    it("blended skips append when impact is medium (gate requires high+)", () => {
      const s = makeSignal({ type: "entry_zone" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        mode: "blended",
        memoryTextMap: new Map([
          [
            "AAPL",
            {
              summary: "Distinct memory phrase about Apple analyst day.",
              impactLevel: "medium",
              relevanceScore: 0.8,
            },
          ],
        ]),
      });
      expect(brief.whatHappening).not.toContain("analyst day");
    });
  });

  describe("analyst mix", () => {
    const aaplMix = {
      strongBuy: 15,
      buy: 24,
      hold: 13,
      sell: 2,
      strongSell: 0,
      total: 54,
      buyPct: 72,
      holdPct: 24,
      sellPct: 4,
      consensus: "buy",
    };

    it("attaches analystMix when the map contains the symbol", () => {
      const s = makeSignal();
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "AAPL",
        analystMixMap: new Map([["AAPL", aaplMix]]),
      });
      expect(brief.analystMix).toEqual(aaplMix);
    });

    it("resolves the map case-insensitively", () => {
      const s = makeSignal({ symbol: "aapl" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "aapl",
        analystMixMap: new Map([["AAPL", aaplMix]]),
      });
      expect(brief.analystMix?.buyPct).toBe(72);
    });

    it("leaves analystMix undefined and keeps price-level whatToWatch when absent", () => {
      const s = makeSignal({
        rawData: {
          close: 175,
          latestOpen: 170,
          daySignal: "bullish",
          swingSignal: "bullish",
          longTermSignal: "bullish",
          entryLow: 168,
          stopLoss: 162,
        },
      });
      const brief = generateDigestBrief({ signals: [s], symbol: "AAPL" });
      expect(brief.analystMix).toBeUndefined();
      expect(brief.whatToWatch.holdAbove).toBe("168.00");
      expect(brief.whatToWatch.breakBelowTarget).toBe("162.00");
    });

    it("does not attach a mix for a symbol missing from the map", () => {
      const s = makeSignal({ symbol: "MSFT" });
      const brief = generateDigestBrief({
        signals: [s],
        symbol: "MSFT",
        analystMixMap: new Map([["AAPL", aaplMix]]),
      });
      expect(brief.analystMix).toBeUndefined();
    });
  });
});
