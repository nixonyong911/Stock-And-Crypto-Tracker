-- Migration 032: Add 52-week high/low range to analysis_stock_fundamentals
-- Sourced from Finnhub stock/metric (52WeekHigh / 52WeekLow and their dates).
-- Powers the Smart Digest "Levels to Watch" bar edges.

BEGIN;

ALTER TABLE analysis_stock_fundamentals
    ADD COLUMN IF NOT EXISTS week_52_high      NUMERIC,
    ADD COLUMN IF NOT EXISTS week_52_low       NUMERIC,
    ADD COLUMN IF NOT EXISTS week_52_high_date DATE,
    ADD COLUMN IF NOT EXISTS week_52_low_date  DATE;

COMMIT;
