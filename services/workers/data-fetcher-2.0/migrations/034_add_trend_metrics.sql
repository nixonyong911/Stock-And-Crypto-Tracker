-- Migration 034: Long-horizon trend metrics.
--
-- 1) analysis_stock_trend_metrics: daily eToro-derived (OneDay candles)
--    52-week range + SMA-50 / SMA-200 / true EMA-50 for stock-universe
--    tickers (incl. indexes like SPX500 and ETFs that have no Finnhub
--    fundamentals coverage). Computed by StockTrendMetricsService.
--    Powers the Smart Digest regime pillar and the Levels-to-Watch frame.
--
-- 2) analysis_crypto_range_52w gains the same MA columns, computed by
--    Crypto52WeekRangeService from the Alpaca 1Day bars it already fetches.
--
-- MA columns are nullable: insufficient bar history (< 50 / < 200 daily
-- bars) stores NULL and downstream consumers degrade gracefully.

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_stock_trend_metrics (
    stock_ticker_id   INTEGER PRIMARY KEY REFERENCES stock_tickers(id) ON DELETE CASCADE,
    week_52_high      NUMERIC NOT NULL,
    week_52_low       NUMERIC NOT NULL,
    week_52_high_date DATE,
    week_52_low_date  DATE,
    sma_50            NUMERIC,
    sma_200           NUMERIC,
    ema_50            NUMERIC,
    coverage_days     INTEGER,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE analysis_crypto_range_52w
    ADD COLUMN IF NOT EXISTS sma_50  NUMERIC,
    ADD COLUMN IF NOT EXISTS sma_200 NUMERIC,
    ADD COLUMN IF NOT EXISTS ema_50  NUMERIC;

COMMIT;
