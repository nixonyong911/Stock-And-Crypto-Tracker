import { describe, it, expect } from "vitest";
import {
  computeAlignment,
  detectForTicker,
  buildContexts,
  type TickerCtx,
  type PriceTargetRow,
  type IndicatorRow,
  type CandlestickRow,
} from "../recommendation-engine.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makePriceTargetRow(
  overrides: Partial<PriceTargetRow> = {},
): PriceTargetRow {
  return {
    ticker_symbol: "AAPL",
    asset_type: "stock",
    trader_type: "swing",
    analysis_date: "2026-03-10",
    latest_close: "150",
    entry_price_low: "145",
    entry_price_high: "155",
    target_price: "180",
    stop_loss: "140",
    signal_summary: "bullish",
    confidence: "0.85",
    metadata: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<TickerCtx> = {}): TickerCtx {
  return {
    symbol: "AAPL",
    assetType: "stock",
    close: 150,
    daySignal: "bullish",
    swingSignal: "bullish",
    longTermSignal: "bullish",
    alignment: "full",
    patterns: [],
    ...overrides,
  };
}

// ── computeAlignment ────────────────────────────────────────────────────

describe("computeAlignment", () => {
  it("returns 'full' when all three signals match", () => {
    expect(computeAlignment("bullish", "bullish", "bullish")).toBe("full");
  });

  it("returns 'partial' when two of three match", () => {
    expect(computeAlignment("bullish", "bullish", "bearish")).toBe("partial");
  });

  it("returns 'conflict' when all three differ", () => {
    expect(computeAlignment("bullish", "bearish", "neutral")).toBe("conflict");
  });

  it("returns 'partial' for neutral + neutral + bullish", () => {
    expect(computeAlignment("neutral", "neutral", "bullish")).toBe("partial");
  });
});

// ── detectForTicker ─────────────────────────────────────────────────────

describe("detectForTicker", () => {
  describe("entry_zone signal", () => {
    it("emits entry_zone with high priority on full alignment", () => {
      const ctx = makeCtx({
        close: 150,
        alignment: "full",
        swing: makePriceTargetRow(),
      });

      const signals = detectForTicker(ctx);

      const entry = signals.find((s) => s.type === "entry_zone");
      expect(entry).toBeDefined();
      expect(entry!.priority).toBe("high");
    });

    it("emits entry_zone with medium priority on partial alignment", () => {
      const ctx = makeCtx({
        close: 150,
        alignment: "partial",
        swing: makePriceTargetRow(),
      });

      const signals = detectForTicker(ctx);

      const entry = signals.find((s) => s.type === "entry_zone");
      expect(entry).toBeDefined();
      expect(entry!.priority).toBe("medium");
    });

    it("does not emit entry_zone on conflict alignment", () => {
      const ctx = makeCtx({
        close: 150,
        alignment: "conflict",
        swing: makePriceTargetRow(),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "entry_zone")).toBeUndefined();
    });

    it("triggers when close is within 2% buffer above entry high", () => {
      const entryHigh = 155;
      const buf = entryHigh * 0.02;
      const ctx = makeCtx({
        close: entryHigh + buf - 0.01,
        alignment: "full",
        swing: makePriceTargetRow({ entry_price_high: "155" }),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "entry_zone")).toBeDefined();
    });

    it("does not trigger when close is far outside entry range", () => {
      const ctx = makeCtx({
        close: 200,
        alignment: "full",
        swing: makePriceTargetRow(),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "entry_zone")).toBeUndefined();
    });
  });

  describe("target_reached signal", () => {
    it("emits when close >= target and swing is bullish", () => {
      const ctx = makeCtx({
        close: 185,
        swingSignal: "bullish",
        swing: makePriceTargetRow({ target_price: "180" }),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "target_reached")).toBeDefined();
    });

    it("does not emit when swing is bearish", () => {
      const ctx = makeCtx({
        close: 185,
        swingSignal: "bearish",
        swing: makePriceTargetRow({ target_price: "180" }),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "target_reached")).toBeUndefined();
    });

    it("does not emit when close is below target", () => {
      const ctx = makeCtx({
        close: 175,
        swingSignal: "bullish",
        swing: makePriceTargetRow({ target_price: "180" }),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "target_reached")).toBeUndefined();
    });
  });

  describe("stop_loss_warning signal", () => {
    it("emits when close <= stop_loss", () => {
      const ctx = makeCtx({
        close: 138,
        swing: makePriceTargetRow({ stop_loss: "140" }),
      });

      const signals = detectForTicker(ctx);

      expect(
        signals.find((s) => s.type === "stop_loss_warning"),
      ).toBeDefined();
    });

    it("does not emit when close is above stop_loss", () => {
      const ctx = makeCtx({
        close: 150,
        swing: makePriceTargetRow({ stop_loss: "140" }),
      });

      const signals = detectForTicker(ctx);

      expect(
        signals.find((s) => s.type === "stop_loss_warning"),
      ).toBeUndefined();
    });
  });

  describe("signal_change signal", () => {
    it("emits high priority when swing flipped bearish -> bullish", () => {
      const ctx = makeCtx({
        swingSignal: "bullish",
        alignment: "partial",
        swing: makePriceTargetRow({ signal_summary: "bullish" }),
        swingYesterday: makePriceTargetRow({ signal_summary: "bearish" }),
      });

      const signals = detectForTicker(ctx);

      const change = signals.find((s) => s.type === "signal_change");
      expect(change).toBeDefined();
      expect(change!.priority).toBe("high");
    });

    it("emits high priority when swing flipped bullish -> bearish", () => {
      const ctx = makeCtx({
        swingSignal: "bearish",
        alignment: "partial",
        swing: makePriceTargetRow({ signal_summary: "bearish" }),
        swingYesterday: makePriceTargetRow({ signal_summary: "bullish" }),
      });

      const signals = detectForTicker(ctx);

      const change = signals.find((s) => s.type === "signal_change");
      expect(change).toBeDefined();
      expect(change!.priority).toBe("high");
    });

    it("does not emit when there is no yesterday data", () => {
      const ctx = makeCtx({
        swing: makePriceTargetRow(),
        swingYesterday: undefined,
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "signal_change")).toBeUndefined();
    });

    it("does not emit when signal is the same both days", () => {
      const ctx = makeCtx({
        swingSignal: "bullish",
        alignment: "full",
        swing: makePriceTargetRow({ signal_summary: "bullish" }),
        swingYesterday: makePriceTargetRow({ signal_summary: "bullish" }),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "signal_change")).toBeUndefined();
    });

    it("does not emit on conflict alignment", () => {
      const ctx = makeCtx({
        swingSignal: "bullish",
        alignment: "conflict",
        swing: makePriceTargetRow({ signal_summary: "bullish" }),
        swingYesterday: makePriceTargetRow({ signal_summary: "bearish" }),
      });

      const signals = detectForTicker(ctx);

      expect(signals.find((s) => s.type === "signal_change")).toBeUndefined();
    });
  });

  describe("momentum_shift signal", () => {
    it("emits bearish headline when MACD flips positive -> negative", () => {
      const ctx = makeCtx({
        todayMacdHist: -0.5,
        yesterdayMacdHist: 0.3,
      });

      const signals = detectForTicker(ctx);

      const shift = signals.find((s) => s.type === "momentum_shift");
      expect(shift).toBeDefined();
      expect(shift!.headline).toContain("bearish");
    });

    it("emits bullish headline when MACD flips negative -> positive", () => {
      const ctx = makeCtx({
        todayMacdHist: 0.5,
        yesterdayMacdHist: -0.3,
      });

      const signals = detectForTicker(ctx);

      const shift = signals.find((s) => s.type === "momentum_shift");
      expect(shift).toBeDefined();
      expect(shift!.headline).toContain("bullish");
    });

    it("does not emit when both days have the same sign", () => {
      const ctx = makeCtx({
        todayMacdHist: 0.5,
        yesterdayMacdHist: 0.3,
      });

      const signals = detectForTicker(ctx);

      expect(
        signals.find((s) => s.type === "momentum_shift"),
      ).toBeUndefined();
    });

    it("does not emit when MACD data is missing", () => {
      const ctx = makeCtx({
        todayMacdHist: undefined,
        yesterdayMacdHist: undefined,
      });

      const signals = detectForTicker(ctx);

      expect(
        signals.find((s) => s.type === "momentum_shift"),
      ).toBeUndefined();
    });
  });

  describe("notable_pattern signal", () => {
    it("emits medium priority for confidence >= 0.9", () => {
      const ctx = makeCtx({
        patterns: [
          { pattern: "morning_star", confidence: 0.92, signal: "bullish" },
        ],
      });

      const signals = detectForTicker(ctx);

      const pattern = signals.find((s) => s.type === "notable_pattern");
      expect(pattern).toBeDefined();
      expect(pattern!.priority).toBe("medium");
    });

    it("emits low priority for confidence 0.8–0.9 (exclusive)", () => {
      const ctx = makeCtx({
        patterns: [
          { pattern: "hammer", confidence: 0.85, signal: "bullish" },
        ],
      });

      const signals = detectForTicker(ctx);

      const pattern = signals.find((s) => s.type === "notable_pattern");
      expect(pattern).toBeDefined();
      expect(pattern!.priority).toBe("low");
    });

    it("does not emit for confidence < 0.8", () => {
      const ctx = makeCtx({
        patterns: [
          { pattern: "doji", confidence: 0.6, signal: "neutral" },
        ],
      });

      const signals = detectForTicker(ctx);

      expect(
        signals.find((s) => s.type === "notable_pattern"),
      ).toBeUndefined();
    });
  });

  describe("no signals", () => {
    it("returns empty array when no conditions match", () => {
      const ctx = makeCtx({
        close: 200,
        alignment: "partial",
        swing: undefined,
        patterns: [],
        todayMacdHist: undefined,
        yesterdayMacdHist: undefined,
      });

      const signals = detectForTicker(ctx);

      expect(signals).toEqual([]);
    });
  });
});

// ── buildContexts ───────────────────────────────────────────────────────

describe("buildContexts", () => {
  it("groups rows by symbol correctly", () => {
    const targets: PriceTargetRow[] = [
      makePriceTargetRow({ ticker_symbol: "AAPL", trader_type: "swing" }),
      makePriceTargetRow({ ticker_symbol: "GOOG", trader_type: "swing" }),
    ];

    const ctxs = buildContexts("stock", targets, [], []);

    const symbols = ctxs.map((c) => c.symbol);
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("GOOG");
    expect(ctxs).toHaveLength(2);
  });

  it("picks swing as primary trader type", () => {
    const targets: PriceTargetRow[] = [
      makePriceTargetRow({
        trader_type: "swing",
        latest_close: "150",
      }),
      makePriceTargetRow({
        trader_type: "day",
        latest_close: "151",
      }),
    ];

    const ctxs = buildContexts("stock", targets, [], []);

    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].close).toBe(150);
    expect(ctxs[0].swing).toBeDefined();
  });

  it("falls back to long_term when no swing row exists", () => {
    const targets: PriceTargetRow[] = [
      makePriceTargetRow({
        trader_type: "long_term",
        latest_close: "200",
        signal_summary: "bearish",
      }),
      makePriceTargetRow({
        trader_type: "day",
        latest_close: "201",
      }),
    ];

    const ctxs = buildContexts("stock", targets, [], []);

    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].close).toBe(200);
    expect(ctxs[0].swing).toBeUndefined();
  });

  it("maps today and yesterday MACD histogram from indicators", () => {
    const targets: PriceTargetRow[] = [
      makePriceTargetRow({ ticker_symbol: "AAPL" }),
    ];
    const indicators: IndicatorRow[] = [
      {
        ticker_symbol: "AAPL",
        analysis_date: "2026-03-10",
        macd_histogram: "1.5",
      },
      {
        ticker_symbol: "AAPL",
        analysis_date: "2026-03-09",
        macd_histogram: "-0.8",
      },
    ];

    const ctxs = buildContexts("stock", targets, indicators, []);

    expect(ctxs[0].todayMacdHist).toBe(1.5);
    expect(ctxs[0].yesterdayMacdHist).toBe(-0.8);
  });

  it("includes candlestick patterns for matching symbol", () => {
    const targets: PriceTargetRow[] = [
      makePriceTargetRow({ ticker_symbol: "AAPL" }),
    ];
    const candles: CandlestickRow[] = [
      {
        ticker_symbol: "AAPL",
        detected_patterns: [
          { pattern: "engulfing", confidence: 0.91, signal: "bullish" },
        ],
      },
    ];

    const ctxs = buildContexts("stock", targets, [], candles);

    expect(ctxs[0].patterns).toHaveLength(1);
    expect(ctxs[0].patterns[0].pattern).toBe("engulfing");
  });
});
