-- Gateway 2.0 Schema Migration
-- Replaces: telegram_users, telegram_sessions, telegram_rate_limits, gateway_sessions (old)
-- Creates: channel_accounts, gateway_sessions (new unified), gateway_usage_log, gateway_security_log, gateway_request_log

-- ============================================================================
-- channel_accounts: unified channel user registry
-- Replaces telegram_users. Links platform identity to Clerk user.
-- ============================================================================
CREATE TABLE IF NOT EXISTS channel_accounts (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT,                              -- nullable until paired via web
  channel_type VARCHAR(50) NOT NULL,               -- 'telegram', 'discord', 'whatsapp', etc.
  platform_user_id VARCHAR(255) NOT NULL,          -- Telegram user ID, Discord user ID, etc.
  platform_username VARCHAR(255),                   -- @username on the platform
  display_name VARCHAR(255),                        -- display name on the platform
  paired_at TIMESTAMPTZ,                            -- when web account was paired
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_type, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_accounts_clerk_user ON channel_accounts(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_accounts_platform ON channel_accounts(channel_type, platform_user_id);

-- ============================================================================
-- gateway_sessions: unified session table
-- Replaces both telegram_sessions and old gateway_sessions.
-- One active session per user, enforced by application logic.
-- ============================================================================
CREATE TABLE IF NOT EXISTS gateway_sessions (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT,                              -- nullable if not paired
  channel_type VARCHAR(50) NOT NULL,
  platform_user_id VARCHAR(255) NOT NULL,
  platform_chat_id VARCHAR(255) NOT NULL,
  cli_session_id UUID NOT NULL DEFAULT gen_random_uuid(),  -- for cursor-agent --resume
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  device_info JSONB,                               -- {language_code, chat_type, is_bot, etc.}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_sessions_user ON gateway_sessions(platform_user_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_gateway_sessions_expires ON gateway_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_gateway_sessions_clerk ON gateway_sessions(clerk_user_id) WHERE clerk_user_id IS NOT NULL;

-- ============================================================================
-- gateway_usage_log: audit trail for all message processing
-- ============================================================================
CREATE TABLE IF NOT EXISTS gateway_usage_log (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,                   -- platform_user_id
  channel_type VARCHAR(50) NOT NULL,
  tier VARCHAR(20) NOT NULL,
  processing_ms INTEGER,
  model VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_usage_log_user ON gateway_usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gateway_usage_log_created ON gateway_usage_log(created_at);

-- ============================================================================
-- gateway_security_log: blocked injection attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS gateway_security_log (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  channel_type VARCHAR(50),
  message_preview TEXT,                             -- first 200 chars
  detection_type VARCHAR(100) NOT NULL,             -- 'pattern_match', 'base64_encoded', etc.
  rule_matched VARCHAR(255),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_security_log_created ON gateway_security_log(created_at);

-- ============================================================================
-- gateway_request_log: request/response logging
-- ============================================================================
CREATE TABLE IF NOT EXISTS gateway_request_log (
  id BIGSERIAL PRIMARY KEY,
  request_id VARCHAR(100),
  method VARCHAR(10),
  path VARCHAR(255),
  user_id VARCHAR(255),
  channel_type VARCHAR(50),
  tier VARCHAR(20),
  status_code INTEGER,
  response_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_request_log_created ON gateway_request_log(created_at);

-- ============================================================================
-- Data migration: telegram_users -> channel_accounts
-- Only run if telegram_users exists (idempotent)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'telegram_users') THEN
    INSERT INTO channel_accounts (clerk_user_id, channel_type, platform_user_id, platform_username, display_name, created_at)
    SELECT
      u.clerk_user_id,
      'telegram',
      tu.telegram_user_id::TEXT,
      tu.telegram_username,
      tu.display_name,
      tu.created_at
    FROM telegram_users tu
    LEFT JOIN users u ON u.telegram_user_id = tu.telegram_user_id
    ON CONFLICT (channel_type, platform_user_id) DO NOTHING;

    RAISE NOTICE 'Migrated telegram_users to channel_accounts';
  END IF;
END $$;
