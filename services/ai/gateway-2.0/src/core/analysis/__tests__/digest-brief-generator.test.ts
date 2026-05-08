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
  it("emits a one-line entry-zone sentence", () => {
    const out = buildWhatHappening(makeSignal({ type: "entry_zone" }));
    expect(out).toMatch(/pulled back/i);
    expect(out.split(/[.!?]/).filter((s) => s.trim().length > 0)).toHaveLength(1);
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
    expect(buildWhatToWatch(s).holdAbove).toBe("168.00");
  });

  it("falls back to periodLow * 0.97 for breakBelowTarget when stopLoss missing", () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        periodLow: 168,
      },
    });
    expect(buildWhatToWatch(s).breakBelowTarget).toBe((168 * 0.97).toFixed(2));
  });

  it("falls back to close when no levels are available", () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
      },
    });
    const out = buildWhatToWatch(s);
    expect(out.holdAbove).toBe("175.00");
    expect(out.breakBelowTarget).toBe((175 * 0.97).toFixed(2));
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
    expect(brief.updatedAt).toBeInstanceOf(Date);
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
});
