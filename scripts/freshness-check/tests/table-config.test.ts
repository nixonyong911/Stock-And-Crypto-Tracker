import { describe, it, expect } from "vitest";
import { TABLE_CHECKS } from "../src/table-config.js";

describe("TABLE_CHECKS", () => {
  it("contains exactly 13 tables", () => {
    expect(TABLE_CHECKS).toHaveLength(13);
  });

  it("has no duplicate table names", () => {
    const names = TABLE_CHECKS.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has no duplicate labels", () => {
    const labels = TABLE_CHECKS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("does not include monthly tables", () => {
    const tables = TABLE_CHECKS.map((t) => t.table);
    expect(tables).not.toContain("analysis_earnings_release_schedule");
  });

  it("all thresholds are positive numbers", () => {
    for (const check of TABLE_CHECKS) {
      expect(check.thresholdHours).toBeGreaterThan(0);
    }
  });

  const expectedTables = [
    { table: "analysis_stock_candlestick_pattern", column: "updated_at", thresholdHours: 2, skipRule: "market-closed" },
    { table: "analysis_indicators_stock_free", column: "indicator_time", thresholdHours: 2, skipRule: "market-closed" },
    { table: "analysis_indicators_stock_pro", column: "indicator_time", thresholdHours: 2, skipRule: "market-closed" },
    { table: "analysis_crypto_candlestick_pattern", column: "updated_at", thresholdHours: 2, skipRule: "never" },
    { table: "analysis_indicators_crypto_free", column: "indicator_time", thresholdHours: 2, skipRule: "never" },
    { table: "analysis_indicators_crypto_pro", column: "indicator_time", thresholdHours: 2, skipRule: "never" },
    { table: "analysis_ticker_price_targets", column: "updated_at", thresholdHours: 26, skipRule: "market-closed" },
    { table: "analysis_stock_fundamentals", column: "updated_at", thresholdHours: 26, skipRule: "market-closed" },
    { table: "analysis_economic_indicators", column: "last_updated_at", thresholdHours: 26, skipRule: "weekends" },
    { table: "analysis_release_calendar", column: "last_synced_at", thresholdHours: 192, skipRule: "never" },
    { table: "unfiltered_news_marketaux", column: "created_at", thresholdHours: 12, skipRule: "never" },
    { table: "unfiltered_news_gnews", column: "created_at", thresholdHours: 18, skipRule: "never" },
    { table: "analysis_filtered_news", column: "processed_at", thresholdHours: 12, skipRule: "never" },
  ] as const;

  it.each(expectedTables)(
    "$table has correct config",
    ({ table, column, thresholdHours, skipRule }) => {
      const found = TABLE_CHECKS.find((t) => t.table === table);
      expect(found).toBeDefined();
      expect(found!.column).toBe(column);
      expect(found!.thresholdHours).toBe(thresholdHours);
      expect(found!.skipRule).toBe(skipRule);
    },
  );

  it("stock tables use market-closed skip rule", () => {
    const stockTables = TABLE_CHECKS.filter((t) => t.table.includes("_stock_"));
    for (const t of stockTables) {
      expect(t.skipRule).toBe("market-closed");
    }
  });

  it("crypto tables use never skip rule", () => {
    const cryptoTables = TABLE_CHECKS.filter((t) => t.table.includes("_crypto_"));
    for (const t of cryptoTables) {
      expect(t.skipRule).toBe("never");
    }
  });
});
