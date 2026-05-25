-- 028_adov_drop_message_body.sql
--
-- Step 16.2.b: drop the dead column. `markOverviewReady` never wrote it,
-- `fetchPriorOverviews` (market-overview.ts line 274) reads `narrative`,
-- not `message_body`. F.4.4 confirmed COUNT(*) WHERE message_body IS
-- NOT NULL = 0 before this migration was applied.

ALTER TABLE analysis_daily_overview DROP COLUMN message_body;
