-- 026_user_recommendation_log_drop_ticker_not_null.sql
--
-- Step 15.2: pivot continuation. Drop NOT NULL from `ticker_symbol` so the
-- Daily Overview ledger writer can stop using the synthetic `'MARKET'`
-- placeholder. Rows linked to a `daily_overview` artifact have no natural
-- ticker_symbol — the artifact is the source of truth.
--
-- Additive only — no data is rewritten and no column is dropped. Pre-15.2
-- rows keep their populated `ticker_symbol`. New rows on the daily overview
-- path will write NULL once the writer is updated in the same release.
--
-- The pre-15.1 Smart Digest path still writes a real ticker; nothing changes
-- there. The CHECK constraints from migration 025 are unaffected.

BEGIN;

ALTER TABLE user_recommendation_log
  ALTER COLUMN ticker_symbol DROP NOT NULL;

COMMIT;
