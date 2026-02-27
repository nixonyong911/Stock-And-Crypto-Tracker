-- ============================================================================
-- logging_keyword_violations: tracks sensitive keyword attempts by users
-- ============================================================================
CREATE TABLE IF NOT EXISTS logging_keyword_violations (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  channel_type VARCHAR(50),
  platform_username VARCHAR(255),
  message_text TEXT,
  matched_keyword VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logging_kv_created ON logging_keyword_violations(created_at);
CREATE INDEX IF NOT EXISTS idx_logging_kv_user ON logging_keyword_violations(user_id, created_at);

-- ============================================================================
-- Drop legacy telegram tables (replaced by gateway-2.0 unified schema)
-- telegram_rate_limits, telegram_sessions, telegram_users are only used by
-- the old services/social-media/telegram-2.0/ which is no longer deployed.
-- ============================================================================
DROP TABLE IF EXISTS telegram_rate_limits;
DROP TABLE IF EXISTS telegram_sessions;
DROP TABLE IF EXISTS telegram_users;
