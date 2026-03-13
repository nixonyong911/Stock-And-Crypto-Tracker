-- Migration: Seed lookup_universe, lookup_data_sources, and worker_fetch_schedules
-- Date: 2026-03-13
-- Source: EF Core InitialCreate (universe seed) + AddFetchSchedules (TwelveData schedule)

BEGIN;

-- ============================================================================
-- SEED: lookup_universe
-- ============================================================================

INSERT INTO lookup_universe (id, name, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES
    (1, 'stock',  TRUE, NOW(), NOW()),
    (2, 'etf',    TRUE, NOW(), NOW()),
    (3, 'crypto', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('lookup_universe', 'id'), GREATEST(3, (SELECT MAX(id) FROM lookup_universe)));

-- ============================================================================
-- SEED: lookup_data_sources (TwelveData — referenced by fetch_schedules seed)
-- ============================================================================

INSERT INTO lookup_data_sources (name, description, base_url, auth_type, supports_stocks, supports_crypto, is_active, created_at, updated_at)
SELECT 'TwelveData',
       'Stock and crypto market data provider (candles, time series)',
       'https://api.twelvedata.com',
       'api_key',
       TRUE,
       TRUE,
       TRUE,
       NOW(),
       NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'TwelveData');

-- ============================================================================
-- SEED: worker_fetch_schedules (TwelveData Daily Stocks)
-- ============================================================================

DO $$
DECLARE
    td_ds_id INT;
BEGIN
    SELECT id INTO td_ds_id FROM lookup_data_sources WHERE name = 'TwelveData' LIMIT 1;

    IF td_ds_id IS NULL THEN
        RAISE NOTICE 'TwelveData data source not found, skipping schedule insert';
        RETURN;
    END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, name, description, schedule_time, schedule_timezone, is_enabled, fetch_config, created_at, updated_at)
    SELECT td_ds_id,
           'TwelveData Daily Stocks',
           'Daily fetch of NASDAQ stock candles after market close',
           '22:00:00'::TIME,
           'America/New_York',
           TRUE,
           '{"fetch_date":"yesterday","interval":"15min","output_size":30,"exchange":"NASDAQ","timezone":"America/New_York","rate_limit_delay_seconds":8}'::JSONB,
           NOW(),
           NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE name = 'TwelveData Daily Stocks');
END $$;

COMMIT;
