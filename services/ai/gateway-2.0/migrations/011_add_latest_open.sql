-- Migration 011: Add latest_open to analysis_ticker_price_targets
-- Stores the daily open price alongside latest_close for watchlist display

ALTER TABLE analysis_ticker_price_targets
    ADD COLUMN IF NOT EXISTS latest_open DECIMAL(24,12);
