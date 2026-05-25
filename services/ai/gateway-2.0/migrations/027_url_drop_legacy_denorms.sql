-- 027_url_drop_legacy_denorms.sql
--
-- Step 16.2.b: lock-in DROP COLUMN for the four legacy denorm columns on
-- user_recommendation_log. Writers have not touched these since 16.2.a
-- (commit cfc8105); the runtime invariant has been clean since the 16.1
-- evidence-based fence closed. Historical content for pre-15.1 rows is
-- preserved by the F.4.2 primary archive (jsonl.gz) + the F.4.2 recovery
-- backup (pg_dump --column-inserts).
--
-- Index 015 `idx_rec_log_user_ticker` references only
-- (clerk_user_id, ticker_symbol, recommendation_type, sent_at) — no
-- index touches any of the four columns being dropped. No FK references
-- the columns (chk_url_* constraints from migration 025 do not depend
-- on them).

BEGIN;

ALTER TABLE user_recommendation_log
  DROP COLUMN priority,
  DROP COLUMN headline,
  DROP COLUMN message_body,
  DROP COLUMN timeframe_alignment;

COMMIT;
