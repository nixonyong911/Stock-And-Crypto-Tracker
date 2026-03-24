export type SkipRule = "market-closed" | "weekends" | "never";

export interface TableCheck {
  table: string;
  column: string;
  thresholdHours: number;
  skipRule: SkipRule;
  label: string;
}

export const TABLE_CHECKS: readonly TableCheck[] = [
  // 30-min interval — stock (skip on market-closed days)
  {
    table: "analysis_stock_candlestick_pattern",
    column: "updated_at",
    thresholdHours: 2,
    skipRule: "market-closed",
    label: "stock_candlestick",
  },
  {
    table: "analysis_indicators_stock_free",
    column: "indicator_time",
    thresholdHours: 2,
    skipRule: "market-closed",
    label: "indicators_stock_free",
  },
  {
    table: "analysis_indicators_stock_pro",
    column: "indicator_time",
    thresholdHours: 2,
    skipRule: "market-closed",
    label: "indicators_stock_pro",
  },

  // 30-min interval — crypto (24/7)
  {
    table: "analysis_crypto_candlestick_pattern",
    column: "updated_at",
    thresholdHours: 2,
    skipRule: "never",
    label: "crypto_candlestick",
  },
  {
    table: "analysis_indicators_crypto_free",
    column: "indicator_time",
    thresholdHours: 2,
    skipRule: "never",
    label: "indicators_crypto_free",
  },
  {
    table: "analysis_indicators_crypto_pro",
    column: "indicator_time",
    thresholdHours: 2,
    skipRule: "never",
    label: "indicators_crypto_pro",
  },

  // Daily — stock (skip on market-closed days)
  {
    table: "analysis_ticker_price_targets",
    column: "updated_at",
    thresholdHours: 26,
    skipRule: "market-closed",
    label: "price_targets",
  },
  {
    table: "analysis_stock_fundamentals",
    column: "updated_at",
    thresholdHours: 26,
    skipRule: "market-closed",
    label: "stock_fundamentals",
  },

  // Daily — FRED (skip on weekends only)
  {
    table: "analysis_economic_indicators",
    column: "last_updated_at",
    thresholdHours: 26,
    skipRule: "weekends",
    label: "economic_indicators",
  },

  // Weekly — release calendar (8-day tolerance)
  {
    table: "analysis_release_calendar",
    column: "last_synced_at",
    thresholdHours: 192,
    skipRule: "never",
    label: "release_calendar",
  },

  // 6-hour cycle — news (always-on)
  {
    table: "analysis_news_marketaux",
    column: "created_at",
    thresholdHours: 12,
    skipRule: "never",
    label: "news_marketaux",
  },
] as const;
