-- Migration 033: 52-week price range for crypto tickers.
-- Computed daily from Alpaca 1Day bars (365-day window) by
-- Crypto52WeekRangeService. Powers the Smart Digest "Levels to Watch" bar
-- frame for crypto, mirroring analysis_stock_fundamentals.week_52_* (032).

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_crypto_range_52w (
    crypto_ticker_id  INTEGER PRIMARY KEY REFERENCES crypto_tickers(id) ON DELETE CASCADE,
    week_52_high      NUMERIC NOT NULL,
    week_52_low       NUMERIC NOT NULL,
    week_52_high_date DATE,
    week_52_low_date  DATE,
    coverage_days     INTEGER,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
