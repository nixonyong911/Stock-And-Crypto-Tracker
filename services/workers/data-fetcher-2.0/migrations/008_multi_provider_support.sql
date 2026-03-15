-- Migration: Multi-provider support (eToro + Alpaca)
-- Date: 2026-03-15

BEGIN;

-- ============================================================================
-- 1. Add eToro data source
-- ============================================================================

INSERT INTO lookup_data_sources (name, base_url, supports_stocks, supports_crypto, is_active, created_at)
SELECT 'eToro', 'https://public-api.etoro.com', true, true, true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'eToro');

-- ============================================================================
-- 2. Add provider columns to stock_tickers
-- ============================================================================

ALTER TABLE stock_tickers
    ADD COLUMN IF NOT EXISTS preferred_data_source_id INTEGER
        REFERENCES lookup_data_sources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS etoro_instrument_id INTEGER;

CREATE INDEX IF NOT EXISTS "IX_stock_tickers_preferred_data_source_id"
    ON stock_tickers (preferred_data_source_id);
CREATE INDEX IF NOT EXISTS "IX_stock_tickers_etoro_instrument_id"
    ON stock_tickers (etoro_instrument_id) WHERE etoro_instrument_id IS NOT NULL;

-- ============================================================================
-- 3. Add provider columns to crypto_tickers
-- ============================================================================

ALTER TABLE crypto_tickers
    ADD COLUMN IF NOT EXISTS preferred_data_source_id INTEGER
        REFERENCES lookup_data_sources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS etoro_instrument_id INTEGER;

CREATE INDEX IF NOT EXISTS "IX_crypto_tickers_preferred_data_source_id"
    ON crypto_tickers (preferred_data_source_id);
CREATE INDEX IF NOT EXISTS "IX_crypto_tickers_etoro_instrument_id"
    ON crypto_tickers (etoro_instrument_id) WHERE etoro_instrument_id IS NOT NULL;

-- ============================================================================
-- 4. Backfill existing tickers with Alpaca as preferred provider
-- ============================================================================

DO $$
DECLARE
    alpaca_ds_id INT;
BEGIN
    SELECT id INTO alpaca_ds_id FROM lookup_data_sources WHERE name = 'Alpaca' LIMIT 1;

    IF alpaca_ds_id IS NOT NULL THEN
        UPDATE stock_tickers
        SET preferred_data_source_id = alpaca_ds_id
        WHERE preferred_data_source_id IS NULL;

        UPDATE crypto_tickers
        SET preferred_data_source_id = alpaca_ds_id
        WHERE preferred_data_source_id IS NULL;
    END IF;
END $$;

-- ============================================================================
-- 5. Provider rate limit tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_rate_limit_state (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_name VARCHAR(50) NOT NULL,
    minute_window TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_provider_rate_limit_state_provider_minute"
    ON provider_rate_limit_state (provider_name, minute_window);

-- ============================================================================
-- 6. Ticker verification log (audit trail for add operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticker_verification_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    result VARCHAR(20) NOT NULL,
    instrument_id INTEGER,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_ticker_verification_log_symbol"
    ON ticker_verification_log (symbol);
CREATE INDEX IF NOT EXISTS "IX_ticker_verification_log_created_at"
    ON ticker_verification_log (created_at DESC);

-- ============================================================================
-- 7. Add eToro fetch schedules
-- ============================================================================

DO $$
DECLARE
    etoro_ds_id INT;
BEGIN
    SELECT id INTO etoro_ds_id FROM lookup_data_sources WHERE name = 'eToro' LIMIT 1;

    IF etoro_ds_id IS NULL THEN
        RAISE NOTICE 'eToro data source not found, skipping schedule inserts';
        RETURN;
    END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, name, schedule_time, schedule_timezone, is_enabled, fetch_config, created_at, updated_at)
    SELECT etoro_ds_id, 'eToro Asset Fetch', '00:00:00'::TIME, 'UTC', true,
           '{"interval_minutes": 30, "asset_types": ["stock","crypto","commodity","index"], "candle_interval": "FifteenMinutes"}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE data_source_id = etoro_ds_id AND name = 'eToro Asset Fetch');
END $$;

COMMIT;
