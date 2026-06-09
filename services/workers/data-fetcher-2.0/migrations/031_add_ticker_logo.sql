-- Migration 031: Add company logo storage to stock_tickers
-- Stores the small (~50-62KB) Finnhub company logo PNG bytes directly in the
-- DB so the Smart Digest card renderer can embed it without an outbound fetch.

BEGIN;

ALTER TABLE stock_tickers
    ADD COLUMN IF NOT EXISTS logo_bytes        BYTEA,
    ADD COLUMN IF NOT EXISTS logo_content_type TEXT,
    ADD COLUMN IF NOT EXISTS logo_fetched_at   TIMESTAMPTZ;

COMMIT;
