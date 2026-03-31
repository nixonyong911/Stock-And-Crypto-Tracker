-- Migration: Extend lookup_etoro_instruments with symbol + instrument_type_id
-- Date: 2026-03-31
-- Purpose: Re-add instrument_type_id and add ticker symbol column to support
--          leaderboard type filtering and human-readable ticker display.
--          These columns were originally dropped by migration 019; the eToro API
--          provides both values via search and metadata endpoints.

BEGIN;

ALTER TABLE lookup_etoro_instruments
    ADD COLUMN IF NOT EXISTS symbol VARCHAR(50),
    ADD COLUMN IF NOT EXISTS instrument_type_id INT;

CREATE INDEX IF NOT EXISTS idx_lookup_etoro_type ON lookup_etoro_instruments(instrument_type_id);
CREATE INDEX IF NOT EXISTS idx_lookup_etoro_symbol ON lookup_etoro_instruments(symbol);

COMMIT;
