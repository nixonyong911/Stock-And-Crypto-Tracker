-- ===========================================
-- Gateway: Initial Schema Migration
-- ===========================================
-- Run this against your Supabase database before deploying the Gateway.
-- Tables: gateway_sessions, gateway_usage_log, gateway_security_log, logging_gateway_request
-- Also: Inserts gateway into worker_versions for CI/CD version tracking
-- ===========================================

-- 1. Gateway Sessions
CREATE TABLE IF NOT EXISTS gateway_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'telegram',
    cli_session_id TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_sessions_user_id ON gateway_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_gateway_sessions_expires_at ON gateway_sessions(expires_at);

-- 2. Gateway Usage Log (audit trail for message counts)
CREATE TABLE IF NOT EXISTS gateway_usage_log (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    channel_type TEXT NOT NULL DEFAULT 'telegram',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_usage_log_user_id ON gateway_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_gateway_usage_log_created_at ON gateway_usage_log(created_at);

-- 3. Gateway Security Log (blocked injection attempts)
CREATE TABLE IF NOT EXISTS gateway_security_log (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel_type TEXT NOT NULL DEFAULT 'telegram',
    message_text TEXT NOT NULL,
    block_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_security_log_created_at ON gateway_security_log(created_at);

-- 4. Gateway Request Logging (mirrors logging_ai_hub_request pattern)
CREATE TABLE IF NOT EXISTS logging_gateway_request (
    id BIGSERIAL PRIMARY KEY,
    request_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    endpoint TEXT NOT NULL,
    request_body JSONB,
    response_body JSONB,
    elapsed_time_sec DOUBLE PRECISION,
    status_code INTEGER
);

CREATE INDEX IF NOT EXISTS idx_logging_gateway_request_timestamp ON logging_gateway_request(request_timestamp);

-- 5. Add gateway to worker_versions for CI/CD version tracking
INSERT INTO worker_versions (service, major_version, minor_version, updated_at)
VALUES ('gateway', 1, 0, NOW())
ON CONFLICT (service) DO NOTHING;
