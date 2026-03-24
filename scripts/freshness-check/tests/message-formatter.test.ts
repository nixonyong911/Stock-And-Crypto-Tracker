import { describe, it, expect } from "vitest";
import { formatMessage } from "../src/message-formatter.js";
import type { CheckResult } from "../src/freshness-checker.js";
import type { MarketCalendarResult } from "../src/market-calendar.js";

const NOW = new Date("2026-03-24T12:00:00Z");
const MARKET_OPEN: MarketCalendarResult = { isTradingDay: true, source: "alpaca" };
const MARKET_CLOSED: MarketCalendarResult = {
  isTradingDay: false,
  reason: "Weekend (Saturday)",
  source: "alpaca",
};

function makeResult(overrides: Partial<CheckResult> & { label: string }): CheckResult {
  return {
    table: `analysis_${overrides.label}`,
    label: overrides.label,
    status: "ok",
    ageHours: 1,
    thresholdHours: 2,
    ...overrides,
  };
}

describe("formatMessage", () => {
  it("produces all-clear when no stale tables", () => {
    const results: CheckResult[] = [
      makeResult({ label: "stock_candlestick", status: "ok", ageHours: 0.5 }),
      makeResult({ label: "crypto_candlestick", status: "ok", ageHours: 0.3 }),
    ];

    const msg = formatMessage(results, MARKET_OPEN, NOW);
    expect(msg).toContain("Data Freshness Check");
    expect(msg).toContain("All 2 tables up to date");
    expect(msg).toContain("Market: Open");
    expect(msg).not.toContain("issue");
  });

  it("shows stale tables when issues found", () => {
    const results: CheckResult[] = [
      makeResult({ label: "stock_candlestick", status: "ok", ageHours: 0.5 }),
      makeResult({ label: "indicators_stock_free", status: "stale", ageHours: 4.2, thresholdHours: 2 }),
      makeResult({ label: "news_marketaux", status: "stale", ageHours: 14, thresholdHours: 12 }),
    ];

    const msg = formatMessage(results, MARKET_OPEN, NOW);
    expect(msg).toContain("2 issues found");
    expect(msg).toContain("indicators_stock_free");
    expect(msg).toContain("news_marketaux");
    expect(msg).toContain("1 OK");
    expect(msg).not.toContain("stock_candlestick");
  });

  it("shows skipped tables with reason", () => {
    const results: CheckResult[] = [
      makeResult({ label: "stock_candlestick", status: "skipped", ageHours: null, skipReason: "Weekend (Saturday)" }),
      makeResult({ label: "crypto_candlestick", status: "ok", ageHours: 0.3 }),
    ];

    const msg = formatMessage(results, MARKET_CLOSED, NOW);
    expect(msg).toContain("1 skipped");
    expect(msg).toContain("Weekend (Saturday)");
    expect(msg).toContain("Market: Closed");
  });

  it("handles mixed stale + skipped", () => {
    const results: CheckResult[] = [
      makeResult({ label: "stock_candlestick", status: "skipped", ageHours: null, skipReason: "Good Friday" }),
      makeResult({ label: "crypto_candlestick", status: "stale", ageHours: 5, thresholdHours: 2 }),
      makeResult({ label: "news_marketaux", status: "ok", ageHours: 3, thresholdHours: 12 }),
    ];

    const msg = formatMessage(results, MARKET_CLOSED, NOW);
    expect(msg).toContain("1 issue");
    expect(msg).toContain("crypto_candlestick");
    expect(msg).toContain("1 OK");
    expect(msg).toContain("1 skipped");
  });

  it("escapes HTML entities in reasons", () => {
    const results: CheckResult[] = [
      makeResult({
        label: "test_table",
        status: "skipped",
        ageHours: null,
        skipReason: "Reason <with> & special chars",
      }),
    ];

    const msg = formatMessage(results, MARKET_OPEN, NOW);
    expect(msg).toContain("&lt;with&gt;");
    expect(msg).toContain("&amp;");
    expect(msg).not.toContain("<with>");
  });

  it("formats age in minutes when < 1h", () => {
    const results: CheckResult[] = [
      makeResult({ label: "crypto", status: "stale", ageHours: 0.5, thresholdHours: 0.25 }),
    ];

    const msg = formatMessage(results, MARKET_OPEN, NOW);
    expect(msg).toContain("30m");
  });

  it("formats age in days when >= 48h", () => {
    const results: CheckResult[] = [
      makeResult({ label: "release_calendar", status: "stale", ageHours: 200, thresholdHours: 192 }),
    ];

    const msg = formatMessage(results, MARKET_OPEN, NOW);
    expect(msg).toContain("8d");
  });

  it("includes timestamp in header", () => {
    const msg = formatMessage([], MARKET_OPEN, NOW);
    expect(msg).toContain("Mar 24 12:00 UTC");
  });
});
