-- Migration: Baseline schema from EF Core migrations (InitialCreate through RenameUsersTables)
-- Date: 2026-03-13
-- All tables use FINAL names after rename migrations.
-- Compatible with PostgreSQL. Uses CREATE TABLE IF NOT EXISTS for idempotency.

BEGIN;

-- ============================================================================
-- LOOKUP TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS lookup_universe (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_lookup_universe_name"
    ON lookup_universe (name);

CREATE TABLE IF NOT EXISTS lookup_data_sources (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    auth_type VARCHAR(50) NOT NULL DEFAULT 'api_key',
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    base_url VARCHAR(500),
    rate_limit_per_minute INTEGER,
    rate_limit_per_day INTEGER,
    timeout_seconds INTEGER NOT NULL DEFAULT 30,
    retry_count INTEGER NOT NULL DEFAULT 3,
    custom_headers JSONB,
    oauth_token_url VARCHAR(500),
    oauth_client_id_encrypted TEXT,
    oauth_client_secret_encrypted TEXT,
    environment VARCHAR(20) NOT NULL DEFAULT 'prod',
    supports_stocks BOOLEAN NOT NULL DEFAULT FALSE,
    supports_crypto BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_lookup_data_sources_name"
    ON lookup_data_sources (name);

-- ============================================================================
-- TICKER TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_tickers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    universe_id INTEGER NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    exchange VARCHAR(50),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_stock_tickers_lookup_universe_universe_id"
        FOREIGN KEY (universe_id) REFERENCES lookup_universe (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_stock_tickers_symbol"
    ON stock_tickers (symbol);
CREATE INDEX IF NOT EXISTS "IX_stock_tickers_universe_id"
    ON stock_tickers (universe_id);
CREATE INDEX IF NOT EXISTS "IX_stock_tickers_is_active"
    ON stock_tickers (is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS crypto_tickers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    universe_id INTEGER NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    slug VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_crypto_tickers_lookup_universe_universe_id"
        FOREIGN KEY (universe_id) REFERENCES lookup_universe (id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_crypto_tickers_symbol"
    ON crypto_tickers (symbol);
CREATE INDEX IF NOT EXISTS "IX_crypto_tickers_slug"
    ON crypto_tickers (slug);
CREATE INDEX IF NOT EXISTS "IX_crypto_tickers_universe_id"
    ON crypto_tickers (universe_id);
CREATE INDEX IF NOT EXISTS "IX_crypto_tickers_is_active"
    ON crypto_tickers (is_active) WHERE is_active = true;

-- ============================================================================
-- PRICE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_prices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_ticker_id INTEGER NOT NULL,
    data_source_id INTEGER NOT NULL,
    price_time TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(18,6) NOT NULL,
    high_price NUMERIC(18,6) NOT NULL,
    low_price NUMERIC(18,6) NOT NULL,
    close_price NUMERIC(18,6) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_stock_prices_stock_tickers_stock_ticker_id"
        FOREIGN KEY (stock_ticker_id) REFERENCES stock_tickers (id) ON DELETE CASCADE,
    CONSTRAINT "FK_stock_prices_lookup_data_sources_data_source_id"
        FOREIGN KEY (data_source_id) REFERENCES lookup_data_sources (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_stock_prices_stock_ticker_id_data_source_id_price_time"
    ON stock_prices (stock_ticker_id, data_source_id, price_time);
CREATE INDEX IF NOT EXISTS "IX_stock_prices_stock_ticker_id_price_time"
    ON stock_prices (stock_ticker_id, price_time);
CREATE INDEX IF NOT EXISTS "IX_stock_prices_data_source_id"
    ON stock_prices (data_source_id);
CREATE INDEX IF NOT EXISTS "IX_stock_prices_price_time"
    ON stock_prices (price_time);

CREATE TABLE IF NOT EXISTS crypto_prices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_ticker_id INTEGER NOT NULL,
    data_source_id INTEGER NOT NULL,
    price_time TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(24,12) NOT NULL,
    high_price NUMERIC(24,12) NOT NULL,
    low_price NUMERIC(24,12) NOT NULL,
    close_price NUMERIC(24,12) NOT NULL,
    volume NUMERIC(24,2) NOT NULL,
    market_cap NUMERIC(24,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_crypto_prices_crypto_tickers_crypto_ticker_id"
        FOREIGN KEY (crypto_ticker_id) REFERENCES crypto_tickers (id) ON DELETE CASCADE,
    CONSTRAINT "FK_crypto_prices_lookup_data_sources_data_source_id"
        FOREIGN KEY (data_source_id) REFERENCES lookup_data_sources (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_crypto_prices_crypto_ticker_id_data_source_id_price_time"
    ON crypto_prices (crypto_ticker_id, data_source_id, price_time);
CREATE INDEX IF NOT EXISTS "IX_crypto_prices_crypto_ticker_id_price_time"
    ON crypto_prices (crypto_ticker_id, price_time);
CREATE INDEX IF NOT EXISTS "IX_crypto_prices_data_source_id"
    ON crypto_prices (data_source_id);
CREATE INDEX IF NOT EXISTS "IX_crypto_prices_price_time"
    ON crypto_prices (price_time);

-- ============================================================================
-- WORKER / FETCH SCHEDULE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_fetch_schedules (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_source_id INTEGER NOT NULL,
    worker_id INTEGER,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    schedule_time TIME NOT NULL DEFAULT '22:00:00',
    schedule_timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    fetch_config JSONB NOT NULL DEFAULT '{}',
    last_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(50),
    last_run_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_worker_fetch_schedules_lookup_data_sources_data_source_id"
        FOREIGN KEY (data_source_id) REFERENCES lookup_data_sources (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_worker_fetch_schedules_data_source_id
    ON worker_fetch_schedules (data_source_id);
CREATE INDEX IF NOT EXISTS ix_worker_fetch_schedules_worker_id
    ON worker_fetch_schedules (worker_id);

-- ============================================================================
-- AI HUB TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_hub_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    model_id VARCHAR(150) NOT NULL,
    caller_service VARCHAR(100),
    google_project_id VARCHAR(100),
    message_preview TEXT,
    response_preview TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    duration_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    rate_limit_type VARCHAR(10),
    status VARCHAR(20) NOT NULL,
    http_status_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ai_hub_logs_status_check
        CHECK (status IN ('success', 'rate_limited', 'server_error', 'unavailable', 'client_error', 'timeout'))
);

CREATE INDEX IF NOT EXISTS "IX_ai_hub_logs_created_at"
    ON ai_hub_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS "IX_ai_hub_logs_google_project_id"
    ON ai_hub_logs (google_project_id);
CREATE INDEX IF NOT EXISTS "IX_ai_hub_logs_model_id"
    ON ai_hub_logs (model_id);
CREATE INDEX IF NOT EXISTS "IX_ai_hub_logs_status"
    ON ai_hub_logs (status);

CREATE TABLE IF NOT EXISTS ai_hub_rate_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_project_id VARCHAR(100) NOT NULL,
    model_family VARCHAR(50) NOT NULL,
    minute_window TIMESTAMPTZ NOT NULL,
    requests_count INTEGER NOT NULL DEFAULT 0,
    tokens_count INTEGER NOT NULL DEFAULT 0,
    pacific_date DATE NOT NULL,
    daily_requests INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_ai_hub_rate_tracking_google_project_id_model_family_minute"
    ON ai_hub_rate_tracking (google_project_id, model_family, minute_window DESC);

-- ============================================================================
-- ANALYSIS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS analysis_stock_candlestick_pattern (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_ticker_id INTEGER NOT NULL,
    analysis_date DATE NOT NULL,
    daily_open NUMERIC(18,6),
    daily_high NUMERIC(18,6),
    daily_low NUMERIC(18,6),
    daily_close NUMERIC(18,6),
    daily_volume BIGINT,
    body_size NUMERIC(18,6),
    range_size NUMERIC(18,6),
    upper_wick NUMERIC(18,6),
    lower_wick NUMERIC(18,6),
    is_bullish BOOLEAN,
    detected_patterns JSONB NOT NULL DEFAULT '[]',
    candles_aggregated INTEGER NOT NULL DEFAULT 0,
    analysis_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_analysis_stock_candlestick_pattern_stock_tickers_stock_ticker_id"
        FOREIGN KEY (stock_ticker_id) REFERENCES stock_tickers (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_analysis_stock_candlestick_pattern_stock_ticker_id_analysis_date"
    ON analysis_stock_candlestick_pattern (stock_ticker_id, analysis_date);
CREATE INDEX IF NOT EXISTS "IX_analysis_stock_candlestick_pattern_analysis_date"
    ON analysis_stock_candlestick_pattern (analysis_date);
CREATE INDEX IF NOT EXISTS idx_analysis_candlestick_patterns
    ON analysis_stock_candlestick_pattern USING GIN (detected_patterns);

-- ============================================================================
-- SUBSCRIPTION TABLES (users_ prefix after rename)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users_subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stripe_subscription_id VARCHAR(100) NOT NULL,
    stripe_price_id VARCHAR(100) NOT NULL,
    stripe_product_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    "interval" VARCHAR(20) NOT NULL,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_users_subscriptions_stripe_subscription_id"
    ON users_subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS "IX_users_subscriptions_user_id"
    ON users_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS users_subscription_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stripe_subscription_id VARCHAR(100),
    event_type VARCHAR(50) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    stripe_event_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IX_users_subscription_history_stripe_event_id"
    ON users_subscription_history (stripe_event_id);
CREATE INDEX IF NOT EXISTS "IX_users_subscription_history_user_id"
    ON users_subscription_history (user_id);

-- ============================================================================
-- TELEGRAM TABLES (created via Supabase, tracked by EF Core model)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    telegram_username VARCHAR(32),
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_telegram_users_telegram_user_id"
    ON telegram_users (telegram_user_id);

CREATE TABLE IF NOT EXISTS telegram_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    session_token UUID NOT NULL DEFAULT gen_random_uuid(),
    cursor_chat_id UUID,
    device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IX_telegram_sessions_user_id"
    ON telegram_sessions (user_id);
CREATE INDEX IF NOT EXISTS "IX_telegram_sessions_cursor_chat_id"
    ON telegram_sessions (cursor_chat_id) WHERE cursor_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_rate_limits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_telegram_rate_limits_telegram_user_id_action_type"
    ON telegram_rate_limits (telegram_user_id, action_type);

COMMIT;
