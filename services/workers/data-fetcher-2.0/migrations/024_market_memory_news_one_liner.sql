-- Add news_one_liner column to analysis_market_memory.
--
-- The column has been used by the gateway-2.0 memory curator and the Smart
-- Digest recommendation engine since the curator started writing it
-- (see services/ai/gateway-2.0/src/core/analysis/memory-curator.ts and
-- services/ai/gateway-2.0/src/core/analysis/recommendation-engine.ts).
-- It was added directly in production but never tracked in a migration,
-- so a fresh database (dev / staging / restored backup) would 500 every
-- digest run. This migration is idempotent and matches the column shape
-- already present in production.

BEGIN;

ALTER TABLE analysis_market_memory
    ADD COLUMN IF NOT EXISTS news_one_liner TEXT;

COMMIT;
