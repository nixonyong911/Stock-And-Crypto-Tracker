-- 025_user_recommendation_log_delivery_ledger.sql
--
-- Step 15: Pivot user_recommendation_log from a content-bearing table into a
-- delivery ledger. Additive only — no columns are dropped, no rows rewritten,
-- no data backfilled. Pre-Step-15 rows remain valid (new columns are nullable
-- or defaulted).
--
-- New columns:
--   artifact_kind           — table router ('smart_digest' | 'daily_overview')
--   artifact_id             — BIGSERIAL PK in the kind-routed artifact table
--   channel_type            — delivery channel (currently always 'telegram')
--   delivery_status         — outcome of the send attempt ('sent' | 'failed')
--   delivery_failure_reason — machine-readable failure tag when status='failed'
--
-- Legacy columns (headline, message_body, priority, timeframe_alignment) are
-- kept in place for dual-write compatibility. headline and priority are made
-- nullable so new rows are not forced to populate them.

BEGIN;

ALTER TABLE user_recommendation_log
  ADD COLUMN artifact_kind           VARCHAR(20),
  ADD COLUMN artifact_id             BIGINT,
  ADD COLUMN channel_type            VARCHAR(20) NOT NULL DEFAULT 'telegram',
  ADD COLUMN delivery_status         VARCHAR(20) NOT NULL DEFAULT 'sent',
  ADD COLUMN delivery_failure_reason VARCHAR(40);

ALTER TABLE user_recommendation_log
  ADD CONSTRAINT chk_url_artifact_kind
    CHECK (artifact_kind IS NULL OR artifact_kind IN ('smart_digest','daily_overview')),
  ADD CONSTRAINT chk_url_delivery_status
    CHECK (delivery_status IN ('sent','failed')),
  ADD CONSTRAINT chk_url_artifact_pair
    CHECK ((artifact_kind IS NULL AND artifact_id IS NULL)
        OR (artifact_kind IS NOT NULL AND artifact_id IS NOT NULL));

CREATE INDEX idx_url_artifact
  ON user_recommendation_log (artifact_kind, artifact_id);
CREATE INDEX idx_url_failed
  ON user_recommendation_log (delivery_status, sent_at DESC)
  WHERE delivery_status = 'failed';

ALTER TABLE user_recommendation_log
  ALTER COLUMN headline DROP NOT NULL,
  ALTER COLUMN priority DROP NOT NULL;

COMMIT;
