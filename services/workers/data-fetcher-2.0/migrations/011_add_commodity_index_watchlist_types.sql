-- Migration: Allow 'commodity' and 'index' asset types in user_watchlist
-- Date: 2026-03-24

BEGIN;

ALTER TABLE user_watchlist DROP CONSTRAINT IF EXISTS user_watchlist_asset_type_check;
ALTER TABLE user_watchlist ADD CONSTRAINT user_watchlist_asset_type_check
  CHECK (asset_type IN ('stock', 'etf', 'crypto', 'commodity', 'index'));

COMMIT;
