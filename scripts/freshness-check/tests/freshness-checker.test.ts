import { describe, it, expect } from "vitest";
import { evaluateTable, evaluateAll } from "../src/freshness-checker.js";
import type { TableCheck } from "../src/table-config.js";
import type { MarketCalendarResult } from "../src/market-calendar.js";

function hoursAgo(hours: number, from: Date = new Date("2026-03-24T12:00:00Z")): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

const NOW = new Date("2026-03-24T12:00:00Z"); // Tuesday
const WEEKEND = new Date("2026-03-28T12:00:00Z"); // Saturday
const HOLIDAY = new Date("2026-04-03T12:00:00Z"); // Good Friday

const MARKET_OPEN: MarketCalendarResult = { isTradingDay: true, source: "alpaca" };
const MARKET_CLOSED_WEEKEND: MarketCalendarResult = {
  isTradingDay: false,
  reason: "Weekend (Saturday)",
  source: "alpaca",
};
const MARKET_CLOSED_HOLIDAY: MarketCalendarResult = {
  isTradingDay: false,
  reason: "Good Friday",
  source: "alpaca",
};

const stockTable: TableCheck = {
  table: "analysis_stock_candlestick_pattern",
  column: "updated_at",
  thresholdHours: 2,
  skipRule: "market-closed",
  label: "stock_candlestick",
};

const cryptoTable: TableCheck = {
  table: "analysis_crypto_candlestick_pattern",
  column: "updated_at",
  thresholdHours: 2,
  skipRule: "never",
  label: "crypto_candlestick",
};

const fredTable: TableCheck = {
  table: "analysis_economic_indicators",
  column: "last_updated_at",
  thresholdHours: 26,
  skipRule: "weekends",
  label: "economic_indicators",
};

const newsTable: TableCheck = {
  table: "analysis_news_marketaux",
  column: "created_at",
  thresholdHours: 12,
  skipRule: "never",
  label: "news_marketaux",
};

const calendarTable: TableCheck = {
  table: "analysis_release_calendar",
  column: "last_synced_at",
  thresholdHours: 192,
  skipRule: "never",
  label: "release_calendar",
};

describe("evaluateTable", () => {
  describe("stock table on trading day", () => {
    it("returns ok when data is fresh", () => {
      const result = evaluateTable(stockTable, hoursAgo(0.5, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("ok");
      expect(result.ageHours).toBe(0.5);
    });

    it("returns stale when data exceeds threshold", () => {
      const result = evaluateTable(stockTable, hoursAgo(4, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("stale");
      expect(result.ageHours).toBe(4);
    });

    it("returns stale at exactly threshold boundary (>)", () => {
      const result = evaluateTable(stockTable, hoursAgo(2.1, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("stale");
    });

    it("returns ok at exactly threshold", () => {
      const result = evaluateTable(stockTable, hoursAgo(2, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("ok");
    });
  });

  describe("stock table on weekend", () => {
    it("returns skipped with reason", () => {
      const result = evaluateTable(stockTable, hoursAgo(48, WEEKEND), WEEKEND, MARKET_CLOSED_WEEKEND);
      expect(result.status).toBe("skipped");
      expect(result.skipReason).toBe("Weekend (Saturday)");
      expect(result.ageHours).toBeNull();
    });
  });

  describe("stock table on NYSE holiday", () => {
    it("returns skipped with holiday name", () => {
      const result = evaluateTable(stockTable, hoursAgo(24, HOLIDAY), HOLIDAY, MARKET_CLOSED_HOLIDAY);
      expect(result.status).toBe("skipped");
      expect(result.skipReason).toBe("Good Friday");
    });
  });

  describe("crypto table on weekend", () => {
    it("still checks and returns ok when fresh", () => {
      const result = evaluateTable(cryptoTable, hoursAgo(0.5, WEEKEND), WEEKEND, MARKET_CLOSED_WEEKEND);
      expect(result.status).toBe("ok");
    });

    it("still checks and returns stale when old", () => {
      const result = evaluateTable(cryptoTable, hoursAgo(5, WEEKEND), WEEKEND, MARKET_CLOSED_WEEKEND);
      expect(result.status).toBe("stale");
    });
  });

  describe("FRED table", () => {
    it("skipped on weekend", () => {
      const result = evaluateTable(fredTable, hoursAgo(48, WEEKEND), WEEKEND, MARKET_CLOSED_WEEKEND);
      expect(result.status).toBe("skipped");
      expect(result.skipReason).toContain("Weekend");
    });

    it("checks normally on weekday", () => {
      const result = evaluateTable(fredTable, hoursAgo(20, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("ok");
    });

    it("returns stale when exceeds 26h on weekday", () => {
      const result = evaluateTable(fredTable, hoursAgo(30, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("stale");
    });
  });

  describe("news table on weekend", () => {
    it("still checks regardless of market", () => {
      const result = evaluateTable(newsTable, hoursAgo(6, WEEKEND), WEEKEND, MARKET_CLOSED_WEEKEND);
      expect(result.status).toBe("ok");
    });

    it("returns stale when exceeds 12h", () => {
      const result = evaluateTable(newsTable, hoursAgo(15, WEEKEND), WEEKEND, MARKET_CLOSED_WEEKEND);
      expect(result.status).toBe("stale");
    });
  });

  describe("release calendar (weekly)", () => {
    it("ok when age < 8 days", () => {
      const result = evaluateTable(calendarTable, hoursAgo(120, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("ok");
    });

    it("stale when age > 8 days", () => {
      const result = evaluateTable(calendarTable, hoursAgo(200, NOW), NOW, MARKET_OPEN);
      expect(result.status).toBe("stale");
    });
  });

  describe("null timestamp (empty table)", () => {
    it("returns stale with 'never' indicator", () => {
      const result = evaluateTable(stockTable, null, NOW, MARKET_OPEN);
      expect(result.status).toBe("stale");
      expect(result.ageHours).toBeNull();
      expect(result.latestTimestamp).toBe("never");
    });
  });
});

describe("evaluateAll", () => {
  it("evaluates all tables and handles errors", async () => {
    const tables: TableCheck[] = [stockTable, cryptoTable];

    const fetcher = async (table: string) => {
      if (table === stockTable.table) return hoursAgo(1, NOW);
      throw new Error("connection refused");
    };

    const results = await evaluateAll(tables, fetcher, NOW, MARKET_OPEN);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("ok");
    expect(results[1].status).toBe("stale");
    expect(results[1].latestTimestamp).toContain("error");
  });
});
