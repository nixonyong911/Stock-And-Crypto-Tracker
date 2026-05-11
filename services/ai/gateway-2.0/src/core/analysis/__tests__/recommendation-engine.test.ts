import { describe, it, expect } from "vitest";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import {
  computeAlignment,
  detectForTicker,
  buildContexts,
  detectNewsSentimentSignals,
  fetchTickerMemoryText,
  fetchMacroContext,
  freshnessDecay,
  compositeAssociationScore,
  type TickerCtx,
  type PriceTargetRow,
  type IndicatorRow,
  type CandlestickRow,
  type NewsSentimentRow,
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
    latest_open: "148",
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
    expect(ctxs[0]!.close).toBe(150);
    expect(ctxs[0]!.swing).toBeDefined();
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
    expect(ctxs[0]!.close).toBe(200);
    expect(ctxs[0]!.swing).toBeUndefined();
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

    expect(ctxs[0]!.todayMacdHist).toBe(1.5);
    expect(ctxs[0]!.yesterdayMacdHist).toBe(-0.8);
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

    expect(ctxs[0]!.patterns).toHaveLength(1);
    expect(ctxs[0]!.patterns[0]!.pattern).toBe("engulfing");
  });
});

// ── detectNewsSentimentSignals ──────────────────────────────────────────

describe("detectNewsSentimentSignals", () => {
  function makeNewsRow(overrides: Partial<NewsSentimentRow> = {}): NewsSentimentRow {
    return {
      symbol: "AAPL",
      article_count: 6,
      avg_sentiment: "0.55",
      ...overrides,
    };
  }

  it("merges technical numerics from TickerCtx into news_sentiment rawData", () => {
    const ctx = makeCtx({
      symbol: "AAPL",
      close: 293.86,
      latestOpen: 279.52,
      alignment: "partial",
      swing: makePriceTargetRow({
        latest_close: "293.86",
        latest_open: "279.52",
        entry_price_low: "259.68",
        entry_price_high: "270.43",
        stop_loss: "241.50",
        target_price: "320.00",
      }),
      meta: { ema_20: 285.0, low_period: 250.0 },
    });
    const ctxBySymbol = new Map<string, TickerCtx>([["AAPL", ctx]]);

    const signals = detectNewsSentimentSignals(
      [makeNewsRow({ article_count: 10, avg_sentiment: "-0.70" })],
      new Map([["AAPL", ["Headline A", "Headline B"]]]),
      "stock",
      ctxBySymbol,
    );

    expect(signals).toHaveLength(1);
    const s = signals[0]!;
    expect(s.type).toBe("news_sentiment");
    expect(s.priority).toBe("high");
    expect(s.timeframeAlignment).toBe("partial");
    expect(s.rawData.close).toBe(293.86);
    expect(s.rawData.latestOpen).toBe(279.52);
    expect(s.rawData.entryLow).toBe(259.68);
    expect(s.rawData.stopLoss).toBe(241.5);
    expect(s.rawData.ema20).toBe(285.0);
    expect(s.rawData.periodLow).toBe(250.0);
    expect(s.rawData.newsArticleCount).toBe(10);
    expect(s.rawData.newsSentimentLabel).toBe("bearish");
    expect(s.rawData.newsHeadlines).toEqual(["Headline A", "Headline B"]);
  });

  it("skips news rows with no matching technical context", () => {
    const ctxBySymbol = new Map<string, TickerCtx>();

    const signals = detectNewsSentimentSignals(
      [makeNewsRow()],
      new Map(),
      "stock",
      ctxBySymbol,
    );

    expect(signals).toEqual([]);
  });

  it("skips news rows whose avg_sentiment is between -0.3 and 0.3", () => {
    const ctxBySymbol = new Map<string, TickerCtx>([
      ["AAPL", makeCtx({ swing: makePriceTargetRow() })],
    ]);

    const signals = detectNewsSentimentSignals(
      [makeNewsRow({ avg_sentiment: "0.1" })],
      new Map(),
      "stock",
      ctxBySymbol,
    );

    expect(signals).toEqual([]);
  });

  it("assigns low priority for score < 4 (count*|avg| = 1.35)", () => {
    const ctxBySymbol = new Map<string, TickerCtx>([
      ["AAPL", makeCtx({ swing: makePriceTargetRow() })],
    ]);

    const signals = detectNewsSentimentSignals(
      [makeNewsRow({ article_count: 3, avg_sentiment: "-0.45" })],
      new Map(),
      "stock",
      ctxBySymbol,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]!.priority).toBe("low");
  });

  it("assigns medium priority for score in [4, 6) (count*|avg| = 5)", () => {
    const ctxBySymbol = new Map<string, TickerCtx>([
      ["AAPL", makeCtx({ swing: makePriceTargetRow() })],
    ]);

    const signals = detectNewsSentimentSignals(
      [makeNewsRow({ article_count: 10, avg_sentiment: "-0.50" })],
      new Map(),
      "stock",
      ctxBySymbol,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]!.priority).toBe("medium");
  });
});

// ── fetchTickerMemoryText ───────────────────────────────────────────────

interface MemoryRow {
  theme: string | null;
  affected_tickers: string[];
  news_one_liner: string | null;
  summary: string | null;
  key_facts: string[] | null;
  market_implications: string | null;
  impact_level: string | null;
  relevance_score: string | null;
  sentiment_score: string | null;
  last_updated: string | null;
  primary_ticker: string | null;
  primary_ticker_source: string | null;
  tickers_inferred: string[] | null;
}

function makeMemoryRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    theme: "Default AAPL theme",
    affected_tickers: ["AAPL"],
    news_one_liner: "Default one-liner about AAPL.",
    summary: "Default summary about AAPL movement.",
    key_facts: ["Fact A", "Fact B"],
    market_implications: "Default implications.",
    impact_level: "medium",
    relevance_score: "0.7",
    sentiment_score: "0.3",
    last_updated: "2026-05-08T12:00:00Z",
    primary_ticker: null,
    primary_ticker_source: null,
    tickers_inferred: [],
    ...overrides,
  };
}

/**
 * Minimal `Pool` mock that returns the provided rows for any query.
 * The fetcher only fires one SQL statement so this is sufficient.
 */
function makeMockPool(rows: MemoryRow[]): Pool {
  const pool = {
    query: async <R extends QueryResultRow>(): Promise<QueryResult<R>> => ({
      rows: rows as unknown as R[],
      rowCount: rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    }),
  };
  return pool as unknown as Pool;
}

describe("fetchTickerMemoryText", () => {
  it("returns an empty map when no symbols are requested", async () => {
    const pool = makeMockPool([]);
    const out = await fetchTickerMemoryText(pool, []);
    expect(out.size).toBe(0);
  });

  it("returns an empty map when no rows match", async () => {
    const pool = makeMockPool([]);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.size).toBe(0);
  });

  it("returns the highest-impact-then-highest-relevance row for a ticker", async () => {
    const freshTs = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const rows = [
      makeMemoryRow({
        impact_level: "medium",
        relevance_score: "0.9",
        news_one_liner: "Medium-impact line",
        last_updated: freshTs,
      }),
      makeMemoryRow({
        impact_level: "high",
        relevance_score: "0.5",
        news_one_liner: "High-impact line",
        last_updated: freshTs,
      }),
      makeMemoryRow({
        impact_level: "high",
        relevance_score: "0.85",
        news_one_liner: "Best high-impact line",
        last_updated: freshTs,
      }),
      makeMemoryRow({
        impact_level: "low",
        relevance_score: "0.99",
        news_one_liner: "Low-impact line",
        last_updated: freshTs,
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    const apple = out.get("AAPL");
    expect(apple).toBeDefined();
    expect(apple!.impactLevel).toBe("high");
    expect(apple!.relevanceScore).toBe(0.85);
    expect(apple!.newsOneLiner).toBe("Best high-impact line");
  });

  it("respects `critical` as the top impact bucket", async () => {
    const rows = [
      makeMemoryRow({
        impact_level: "critical",
        relevance_score: "0.4",
        news_one_liner: "Critical line",
      }),
      makeMemoryRow({
        impact_level: "high",
        relevance_score: "0.99",
        news_one_liner: "Highest-relevance high",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.newsOneLiner).toBe("Critical line");
  });

  it("matches via crypto base alias (BTC/USD <-> BTC)", async () => {
    const rows = [
      makeMemoryRow({
        affected_tickers: ["BTC"],
        news_one_liner: "BTC-base hit",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    expect(out.get("BTC/USD")?.newsOneLiner).toBe("BTC-base hit");
  });

  it("matches via index ETF alias (SPX500 <-> SPY)", async () => {
    const rows = [
      makeMemoryRow({
        affected_tickers: ["SPY"],
        news_one_liner: "SPY-key memory",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["SPX500"]);
    expect(out.get("SPX500")?.newsOneLiner).toBe("SPY-key memory");
  });

  it("normalizes impact_level capitalization and unknown values", async () => {
    const rows = [
      makeMemoryRow({ impact_level: "HIGH" }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.impactLevel).toBe("high");
  });

  it("omits whitespace-only news_one_liner", async () => {
    const rows = [makeMemoryRow({ news_one_liner: "   " })];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.newsOneLiner).toBeUndefined();
  });
});

// ── Affinity gate (step 3) ─────────────────────────────────────────────

describe("fetchTickerMemoryText — affinity-aware ranking and rejection", () => {
  it("rejects an ETH-primary row that lists BTC at position 2 with no BTC token", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "Ethereum analyst-day setup",
        // No "BTC" / "Bitcoin" token anywhere in text.
        news_one_liner: "Ethereum's $3,000 target gains analyst consensus.",
        affected_tickers: ["ETH", "BTC", "COIN", "IBIT"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    expect(out.get("BTC/USD")).toBeUndefined();
  });

  it("prefers a BTC-primary row over an ETH-primary BTC-listed row even when ETH is fresher", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "Ethereum analyst-day setup",
        news_one_liner: "Ethereum's $3,000 target gains analyst consensus.",
        affected_tickers: ["ETH", "BTC", "COIN", "IBIT"],
        impact_level: "high",
        relevance_score: "1.000",
        // Fresher than the BTC row below — pre-affinity, this would win.
        last_updated: "2026-05-09T20:00:00Z",
      }),
      makeMemoryRow({
        theme: "Bitcoin Custodial Censorship-Resistance Myth",
        news_one_liner:
          "US seizure of Iranian crypto assets proves state actors can restrict BTC access at scale.",
        affected_tickers: ["BTC", "ETH", "COIN"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T08:00:00Z",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    const picked = out.get("BTC/USD");
    expect(picked).toBeDefined();
    expect(picked!.newsOneLiner).toMatch(/seizure of Iranian crypto/);
  });

  it("returns no memory when every candidate fails the affinity gate", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "PLA Leadership Purge Escalation",
        news_one_liner:
          "Tail-risk premiums rise for Taiwan-exposed tech and semiconductor names.",
        affected_tickers: ["FXI", "SPX500", "NSDQ100", "NVDA", "AAPL"],
        impact_level: "medium",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
      }),
      makeMemoryRow({
        theme: "Big Tech AI litigation wave",
        // No 'AAPL' token, no 'Apple' token; AAPL at position 3, n=5.
        news_one_liner: "Sector compliance costs rise across mega-caps.",
        affected_tickers: ["MSFT", "GOOGL", "AAPL", "META", "NSDQ100"],
        impact_level: "medium",
        relevance_score: "1.000",
        last_updated: "2026-05-09T19:00:00Z",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")).toBeUndefined();
  });

  it("alias-position hit accepts BTC-only row for BTC/USD digest", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "Bitcoin Quantum Computing Vulnerability",
        news_one_liner:
          "Galaxy Digital flags Bitcoin's quantum risk for ETF issuers and BTC custody providers.",
        affected_tickers: ["BTC"],
        impact_level: "low",
        relevance_score: "1.000",
        last_updated: "2026-05-04T12:00:00Z",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    expect(out.get("BTC/USD")?.newsOneLiner).toMatch(/quantum risk/);
  });

  it("affinity outranks freshness within the same impact bucket", async () => {
    const rows: MemoryRow[] = [
      // High affinity (text + position + narrow), but older.
      makeMemoryRow({
        theme: "AAPL services revenue beat",
        news_one_liner: "AAPL services revenue ahead of estimates.",
        affected_tickers: ["AAPL"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-08T08:00:00Z",
      }),
      // Same impact, lower affinity (no text token), but newer.
      makeMemoryRow({
        theme: "Mega-cap basket rebalance ahead of quarterly close",
        news_one_liner:
          "Index funds rebalancing flows tilt against the largest names.",
        affected_tickers: ["AAPL", "MSFT", "GOOGL"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T20:00:00Z",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.newsOneLiner).toMatch(/services revenue/);
  });
});

// ── Slice 3: primary_ticker adoption in fetchTickerMemoryText ─────────

describe("fetchTickerMemoryText — primary_ticker adoption", () => {
  it("heuristic primary recovers a non-position-1 BTC subject row", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "Ethereum analyst-day setup",
        news_one_liner: "Ethereum's $3,000 target gains analyst consensus.",
        affected_tickers: ["ETH", "BTC", "COIN"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
        primary_ticker: "BTC",
        primary_ticker_source: "batch_heuristic",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    // Without primary_ticker, this row scores 0 (text miss) + 0 (position miss) + 1 (narrow) = 1 → rejected.
    // With batch_heuristic primary_ticker="BTC", it scores 0 + 2 (heuristic hit) + 1 (narrow) = 3 → passes.
    expect(out.get("BTC/USD")).toBeDefined();
    expect(out.get("BTC/USD")?.newsOneLiner).toMatch(/\$3,000 target/);
  });

  it("heuristic primary mismatch defends contamination even when alias is at position 1", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "Ethereum DeFi convergence",
        news_one_liner: "DeFi convergence accelerates institutional interest.",
        affected_tickers: ["BTC", "ETH"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
        primary_ticker: "ETH",
        primary_ticker_source: "batch_heuristic",
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    // BTC is at position 1 (would normally score +2 via position_primary_hit).
    // But primary_ticker_source is non-null, so the mutex fires: primary_ticker="ETH"
    // doesn't match BTC aliases → heuristic miss (+0). Score = 0 + 0 + 1 (narrow n=2) = 1 → rejected.
    expect(out.get("BTC/USD")).toBeUndefined();
  });

  it("NULL source preserves legacy behavior (existing rejection test still passes)", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "Ethereum analyst-day setup",
        news_one_liner: "Ethereum's $3,000 target gains analyst consensus.",
        affected_tickers: ["ETH", "BTC", "COIN", "IBIT"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["BTC/USD"]);
    // NULL source → legacy path: position_primary_miss:position=2, no text token → rejected.
    expect(out.get("BTC/USD")).toBeUndefined();
  });
});

// ── fetchMacroContext (B2) ─────────────────────────────────────────────

interface MacroRow {
  title: string;
  description: string | null;
  category: string;
  sentiment_score: string | null;
}

function makeMacroRow(overrides: Partial<MacroRow> = {}): MacroRow {
  return {
    title: "Default macro headline",
    description: null,
    category: "macro",
    sentiment_score: "0.4",
    ...overrides,
  };
}

function makeMacroPool(rows: MacroRow[]): Pool {
  const pool = {
    query: async <R extends QueryResultRow>(): Promise<QueryResult<R>> => ({
      rows: rows as unknown as R[],
      rowCount: rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    }),
  };
  return pool as unknown as Pool;
}

describe("fetchMacroContext — B2 dominantTheme agreement gate", () => {
  it("returns dominantTheme when ≥3 rows agree on a single category", async () => {
    const rows = [
      makeMacroRow({ category: "macro", title: "row 1" }),
      makeMacroRow({ category: "macro", title: "row 2" }),
      makeMacroRow({ category: "macro", title: "row 3" }),
      makeMacroRow({ category: "policy", title: "row 4" }),
    ];
    const pool = makeMacroPool(rows);
    const out = await fetchMacroContext(pool);
    expect(out.dominantTheme).toBe("macro");
    expect(out.headlines).toHaveLength(4);
  });

  it("emits null dominantTheme when no category clears the agreement floor (1+1+1 split)", async () => {
    const rows = [
      makeMacroRow({ category: "macro", title: "row 1" }),
      makeMacroRow({ category: "policy", title: "row 2" }),
      makeMacroRow({ category: "geopolitical", title: "row 3" }),
    ];
    const pool = makeMacroPool(rows);
    const out = await fetchMacroContext(pool);
    expect(out.dominantTheme).toBeNull();
  });

  it("emits null dominantTheme when leading category has only 2 supporters", async () => {
    const rows = [
      makeMacroRow({ category: "macro", title: "row 1" }),
      makeMacroRow({ category: "macro", title: "row 2" }),
      makeMacroRow({ category: "policy", title: "row 3" }),
      makeMacroRow({ category: "policy", title: "row 4" }),
    ];
    const pool = makeMacroPool(rows);
    const out = await fetchMacroContext(pool);
    expect(out.dominantTheme).toBeNull();
  });

  it("still averages sentiment across every fresh row even when the theme is null", async () => {
    const rows = [
      makeMacroRow({ category: "macro", sentiment_score: "0.5" }),
      makeMacroRow({ category: "policy", sentiment_score: "-0.1" }),
      makeMacroRow({ category: "geopolitical", sentiment_score: "0.2" }),
    ];
    const pool = makeMacroPool(rows);
    const out = await fetchMacroContext(pool);
    expect(out.dominantTheme).toBeNull();
    expect(out.overallSentiment).toBeCloseTo((0.5 - 0.1 + 0.2) / 3, 5);
  });

  it("returns the empty contract when the DB returns no rows", async () => {
    const pool = makeMacroPool([]);
    const out = await fetchMacroContext(pool);
    expect(out).toEqual({ headlines: [], dominantTheme: null, overallSentiment: 0 });
  });
});

// ── Step-5 association ranking model ─────────────────────────────────

describe("freshnessDecay", () => {
  it("returns 1.0 at age 0", () => {
    expect(freshnessDecay(0, 72)).toBe(1);
  });

  it("returns 0 at the half-life edge", () => {
    expect(freshnessDecay(72, 72)).toBe(0);
  });

  it("returns ~0.5 at half the half-life", () => {
    expect(freshnessDecay(36, 72)).toBeCloseTo(0.5, 5);
  });

  it("clamps to 0 beyond the half-life", () => {
    expect(freshnessDecay(200, 72)).toBe(0);
  });

  it("returns 1 for negative ages (defensive: future timestamps)", () => {
    expect(freshnessDecay(-5, 72)).toBe(1);
  });

  it("returns 0 for non-positive half-life (defensive)", () => {
    expect(freshnessDecay(10, 0)).toBe(0);
  });
});

describe("compositeAssociationScore", () => {
  it("on-symbol bonus pushes a same-relevance row above its peer", () => {
    const a = compositeAssociationScore({
      relevance: 1,
      ageHours: 6,
      halfLifeHours: 72,
      oneLinerOnSymbol: true,
    });
    const b = compositeAssociationScore({
      relevance: 1,
      ageHours: 6,
      halfLifeHours: 72,
      oneLinerOnSymbol: false,
    });
    expect(a).toBeGreaterThan(b);
    expect(a - b).toBeCloseTo(0.25, 5);
  });

  it("freshness decay pulls the score down toward 0 with age", () => {
    const fresh = compositeAssociationScore({
      relevance: 1,
      ageHours: 0,
      halfLifeHours: 72,
      oneLinerOnSymbol: false,
    });
    const stale = compositeAssociationScore({
      relevance: 1,
      ageHours: 60,
      halfLifeHours: 72,
      oneLinerOnSymbol: false,
    });
    expect(fresh).toBeGreaterThan(stale);
  });
});

// Integration tests for `fetchTickerMemoryText`'s ranking. Each test
// stubs Postgres directly so we can assert which row wins the chosen
// slot under the new comparator.

interface MemRow {
  theme: string | null;
  affected_tickers: string[];
  news_one_liner: string | null;
  summary: string | null;
  key_facts: string[] | null;
  market_implications: string | null;
  impact_level: string | null;
  relevance_score: string | null;
  sentiment_score: string | null;
  last_updated: string | null;
  tickers_inferred: string[] | null;
}

function makeMemRow(overrides: Partial<MemRow> = {}): MemRow {
  return {
    theme: "Apple guidance reset",
    affected_tickers: ["AAPL"],
    news_one_liner: "Apple guidance reset lifts services confidence.",
    summary: "Apple raised services guidance.",
    key_facts: null,
    market_implications: null,
    impact_level: "high",
    relevance_score: "0.8",
    sentiment_score: "0.4",
    last_updated: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    tickers_inferred: [],
    ...overrides,
  };
}

function makeMemoryPool(rows: MemRow[]): Pool {
  return {
    query: async <R extends QueryResultRow>(): Promise<QueryResult<R>> => ({
      rows: rows as unknown as R[],
      rowCount: rows.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    }),
  } as unknown as Pool;
}

describe("fetchTickerMemoryText — Step-5 association ranking", () => {
  it("at equal impact + affinity, fresher row beats stale row", async () => {
    const stale = makeMemRow({
      theme: "AAPL stale",
      news_one_liner: "AAPL stale line.",
      last_updated: new Date(Date.now() - 60 * 3_600_000).toISOString(),
    });
    const fresh = makeMemRow({
      theme: "AAPL fresh",
      news_one_liner: "AAPL fresh line.",
      last_updated: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    });
    const pool = makeMemoryPool([stale, fresh]);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.newsOneLiner).toBe("AAPL fresh line.");
  });

  it("at equal impact + affinity + age, on-symbol one-liner beats off-symbol one-liner", async () => {
    const offSym = makeMemRow({
      theme: "AAPL competition theme",
      news_one_liner: "Google Cloud announces partnership.",
      last_updated: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    });
    const onSym = makeMemRow({
      theme: "AAPL guidance",
      news_one_liner: "AAPL services guidance lifted.",
      last_updated: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    });
    const pool = makeMemoryPool([offSym, onSym]);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.newsOneLiner).toBe(
      "AAPL services guidance lifted.",
    );
  });

  it("impact stays a hard primary: stale critical beats fresh high (Step-5 hypothesis)", async () => {
    // Recorded in plan as a hypothesis to validate; this test pins the
    // current behavior so any future change to demote impact to a
    // graded weight is an explicit, deliberate code+test change.
    const staleCritical = makeMemRow({
      theme: "AAPL critical",
      news_one_liner: "AAPL critical event.",
      impact_level: "critical",
      last_updated: new Date(Date.now() - 60 * 3_600_000).toISOString(),
    });
    const freshHigh = makeMemRow({
      theme: "AAPL high",
      news_one_liner: "AAPL high event.",
      impact_level: "high",
      last_updated: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    const pool = makeMemoryPool([staleCritical, freshHigh]);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")?.impactLevel).toBe("critical");
  });
});

// ── Slice 6: tickers_inferred plumbing ─────────────────────────────────

describe("fetchTickerMemoryText — slice 6 tickers_inferred passthrough", () => {
  it("empty tickers_inferred does not change chosen-row decision (regression guard)", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "AAPL services beat",
        news_one_liner: "AAPL services revenue exceeded expectations.",
        affected_tickers: ["AAPL"],
        impact_level: "high",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
        tickers_inferred: [],
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["AAPL"]);
    expect(out.get("AAPL")).toBeDefined();
    expect(out.get("AAPL")?.newsOneLiner).toMatch(/services revenue/);
  });

  it("non-empty tickers_inferred passes through without changing decision (default penalty = 0)", async () => {
    const rows: MemoryRow[] = [
      makeMemoryRow({
        theme: "JEPI Covered-Call ETF Structural Flaw",
        news_one_liner: "JEPI distribution sustainability risk.",
        affected_tickers: ["JEPI"],
        impact_level: "medium",
        relevance_score: "1.000",
        last_updated: "2026-05-09T18:00:00Z",
        tickers_inferred: ["SPX500"],
      }),
    ];
    const pool = makeMockPool(rows);
    const out = await fetchTickerMemoryText(pool, ["JEPI"]);
    expect(out.get("JEPI")).toBeDefined();
    expect(out.get("JEPI")?.newsOneLiner).toMatch(/distribution sustainability/);
  });
});

