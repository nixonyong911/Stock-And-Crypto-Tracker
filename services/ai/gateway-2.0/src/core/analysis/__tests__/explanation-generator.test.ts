import { describe, it, expect, vi } from "vitest";
import {
  deriveOutlook,
  deriveHorizon,
  deriveConfidence,
  deriveRisk,
  templateForSignal,
  stackTemplates,
  generateExplanation,
} from "../explanation-generator.js";
import type { TickerSignal } from "../recommendation-engine.js";

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
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
      ...overrides.rawData,
    },
    ...overrides,
  };
}

const mockRedis = {
  incr: vi.fn().mockResolvedValue(100),
  expire: vi.fn().mockResolvedValue(1),
} as any;

const mockLogger = { info: vi.fn(), warn: vi.fn() } as any;

describe("deriveOutlook", () => {
  it("returns capitalized swingSignal on full alignment", () => {
    const s = makeSignal({
      timeframeAlignment: "full",
      rawData: { close: 175, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish" },
    });
    expect(deriveOutlook(s)).toBe("Bullish");
  });

  it("returns capitalized daySignal on partial alignment", () => {
    const s = makeSignal({
      timeframeAlignment: "partial",
      rawData: { close: 175, daySignal: "bearish", swingSignal: "bullish", longTermSignal: "bullish" },
    });
    expect(deriveOutlook(s)).toBe("Bearish");
  });

  it('returns "Mixed" on conflict', () => {
    const s = makeSignal({ timeframeAlignment: "conflict" });
    expect(deriveOutlook(s)).toBe("Mixed");
  });
});

describe("deriveHorizon", () => {
  it('returns "Uncertain" on conflict alignment', () => {
    const s = makeSignal({ timeframeAlignment: "conflict" });
    expect(deriveHorizon(s)).toBe("Uncertain");
  });

  it('returns "Short-term (days)" for notable_pattern', () => {
    const s = makeSignal({ type: "notable_pattern" });
    expect(deriveHorizon(s)).toBe("Short-term (days)");
  });

  it('returns "Position (2-4 weeks)" for signal_change', () => {
    const s = makeSignal({ type: "signal_change" });
    expect(deriveHorizon(s)).toBe("Position (2-4 weeks)");
  });

  it('returns "Swing (1-3 weeks)" for entry_zone', () => {
    const s = makeSignal({ type: "entry_zone" });
    expect(deriveHorizon(s)).toBe("Swing (1-3 weeks)");
  });
});

describe("deriveConfidence", () => {
  it('returns "Low" on conflict alignment', () => {
    const s = makeSignal({ timeframeAlignment: "conflict" });
    expect(deriveConfidence(s)).toBe("Low");
  });

  it('returns "Low" when confidence < 0.4', () => {
    const s = makeSignal({
      timeframeAlignment: "partial",
      rawData: { close: 175, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish", confidence: 0.3 },
    });
    expect(deriveConfidence(s)).toBe("Low");
  });

  it('returns "High" when confidence >= 0.7 and full alignment', () => {
    const s = makeSignal({
      timeframeAlignment: "full",
      rawData: { close: 175, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish", confidence: 0.8 },
    });
    expect(deriveConfidence(s)).toBe("High");
  });

  it('returns "Medium" when confidence >= 0.7 and partial alignment', () => {
    const s = makeSignal({
      timeframeAlignment: "partial",
      rawData: { close: 175, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish", confidence: 0.8 },
    });
    expect(deriveConfidence(s)).toBe("Medium");
  });

  it('returns "Medium" when no confidence value is set', () => {
    const s = makeSignal({ timeframeAlignment: "full" });
    expect(deriveConfidence(s)).toBe("Medium");
  });
});

describe("deriveRisk", () => {
  it('returns "Higher" on conflict alignment', () => {
    const s = makeSignal({ timeframeAlignment: "conflict" });
    expect(deriveRisk(s)).toBe("Higher");
  });

  it('returns "Higher" when stop loss > 5% from close', () => {
    const s = makeSignal({
      timeframeAlignment: "full",
      rawData: { close: 100, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish", stopLoss: 90 },
    });
    expect(deriveRisk(s)).toBe("Higher");
  });

  it('returns "Medium" when stop loss 3-5% from close with partial alignment', () => {
    const s = makeSignal({
      timeframeAlignment: "partial",
      rawData: { close: 100, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish", stopLoss: 96 },
    });
    expect(deriveRisk(s)).toBe("Medium");
  });

  it('returns "Low-Medium" when stop loss < 3% from close with full alignment', () => {
    const s = makeSignal({
      timeframeAlignment: "full",
      rawData: { close: 100, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish", stopLoss: 98 },
    });
    expect(deriveRisk(s)).toBe("Low-Medium");
  });
});

describe("templateForSignal", () => {
  it("returns an Explanation with all six fields", () => {
    const result = templateForSignal(makeSignal());
    expect(result).toHaveProperty("whatsHappening");
    expect(result).toHaveProperty("whatToWatch");
    expect(result).toHaveProperty("outlook");
    expect(result).toHaveProperty("horizon");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("risk");
  });

  it("does not set newsOneLiner (set externally)", () => {
    const result = templateForSignal(makeSignal());
    expect(result.newsOneLiner).toBeUndefined();
  });
});

describe("stackTemplates", () => {
  it("joins whatsHappening and whatToWatch from multiple signals", () => {
    const s1 = makeSignal({ symbol: "AAPL", headline: "AAPL entry zone" });
    const s2 = makeSignal({ symbol: "MSFT", type: "target_reached", headline: "MSFT target reached" });
    const result = stackTemplates([s1, s2]);

    expect(result.whatsHappening).toContain("AAPL");
    expect(result.whatsHappening).toContain("MSFT");
    expect(result.whatToWatch).toBeTruthy();
  });
});

describe("generateExplanation", () => {
  it("returns neutral fallback for empty signals", async () => {
    const result = await generateExplanation([], mockLogger, mockRedis);

    expect(result.whatsHappening).toBe("No actionable signals detected.");
    expect(result.whatToWatch).toBe("Monitor for emerging technical patterns.");
    expect(result.outlook).toBe("Neutral");
    expect(result.horizon).toBe("Uncertain");
    expect(result.confidence).toBe("Low");
    expect(result.risk).toBe("Medium");
  });

  it("returns template for a single signal", async () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        entryLow: 170,
        entryHigh: 175,
      },
    });
    const result = await generateExplanation([s], mockLogger, mockRedis);

    expect(result.whatsHappening).toContain("support level");
    expect(result.outlook).toBe("Bullish");
  });

  it("falls back to stacked templates when Redis count exceeds limit", async () => {
    const s1 = makeSignal({ symbol: "AAPL" });
    const s2 = makeSignal({ symbol: "MSFT", type: "target_reached" });

    const result = await generateExplanation([s1, s2], mockLogger, mockRedis);

    expect(result.whatsHappening).toContain("AAPL");
    expect(result.whatsHappening).toContain("MSFT");
  });

  it('includes "selling pressure" when RSI < 30', async () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        entryLow: 170,
        entryHigh: 175,
        rsi: 25,
      },
    });
    const result = await generateExplanation([s], mockLogger, mockRedis);

    expect(result.whatsHappening).toContain("selling pressure");
  });

  it('includes "extended" when RSI > 70', async () => {
    const s = makeSignal({
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        entryLow: 170,
        entryHigh: 175,
        rsi: 75,
      },
    });
    const result = await generateExplanation([s], mockLogger, mockRedis);

    expect(result.whatsHappening).toContain("extended");
  });
});
