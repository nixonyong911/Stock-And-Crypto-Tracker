-- Migration 021: Drop redundant internal_symbol column
-- The internal_symbol column held identical values to symbol (both populated from eToro's symbolFull API field).
-- No external consumers (MCP, AI gateway, frontend) reference it. Safe to remove.

ALTER TABLE lookup_etoro_instruments
    DROP COLUMN IF EXISTS internal_symbol;
