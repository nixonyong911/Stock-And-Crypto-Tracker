-- Migration: Restructure lookup_etoro_instruments
-- Date: 2026-03-31
-- Purpose: Drop FK constraints from unfiltered tables, slim down the lookup table
--          to only columns the eToro API actually provides (display_name, internal_symbol),
--          and remove hollow rows (NULL metadata). The worker now uses an in-memory
--          instrument map, and unfiltered tables no longer need FK references.

BEGIN;

-- 1. Drop FK constraints from all 3 unfiltered tables
ALTER TABLE unfiltered_etoro_social_instrument_data
    DROP CONSTRAINT IF EXISTS unfiltered_etoro_social_instrument_data_instrument_id_fkey;

ALTER TABLE unfiltered_etoro_top_investor_positions
    DROP CONSTRAINT IF EXISTS unfiltered_etoro_top_investor_positions_instrument_id_fkey;

ALTER TABLE unfiltered_etoro_curated_lists
    DROP CONSTRAINT IF EXISTS unfiltered_etoro_curated_lists_instrument_id_fkey;

-- 2. Drop columns the eToro API never returns
ALTER TABLE lookup_etoro_instruments
    DROP COLUMN IF EXISTS symbol,
    DROP COLUMN IF EXISTS instrument_type_id,
    DROP COLUMN IF EXISTS instrument_type,
    DROP COLUMN IF EXISTS is_active;

-- 3. Drop indexes that reference dropped columns
DROP INDEX IF EXISTS idx_lookup_etoro_type;
DROP INDEX IF EXISTS idx_lookup_etoro_symbol;

-- 4. Add internal_symbol column (populated by internalSymbolFull from eToro API)
ALTER TABLE lookup_etoro_instruments
    ADD COLUMN IF NOT EXISTS internal_symbol VARCHAR(50);

-- 5. Delete hollow rows (no display_name = no real metadata)
DELETE FROM lookup_etoro_instruments WHERE display_name IS NULL;

-- 6. Make display_name NOT NULL now that hollow rows are gone
ALTER TABLE lookup_etoro_instruments
    ALTER COLUMN display_name SET NOT NULL;

COMMIT;
