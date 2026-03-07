-- Migration: Add Alpaca data source and fetch schedules
-- Date: 2026-03-07

BEGIN;

-- 1. Add Alpaca data source (idempotent: skip if name already exists)
INSERT INTO lookup_data_sources (name, base_url, is_active, created_at)
SELECT 'Alpaca', 'https://data.alpaca.markets', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'Alpaca');

-- 2. Add Alpaca Stock Fetch and Alpaca Crypto Fetch schedules
DO $$
DECLARE
    alpaca_ds_id INT;
BEGIN
    SELECT id INTO alpaca_ds_id FROM lookup_data_sources WHERE name = 'Alpaca' LIMIT 1;

    IF alpaca_ds_id IS NULL THEN
        RAISE NOTICE 'Alpaca data source not found, skipping schedule inserts';
        RETURN;
    END IF;

    -- Alpaca Stock Fetch (30-min interval, stocks)
    INSERT INTO worker_fetch_schedules (data_source_id, name, schedule_time, schedule_timezone, is_enabled, fetch_config, created_at, updated_at)
    SELECT alpaca_ds_id, 'Alpaca Stock Fetch', '00:00:00'::TIME, 'UTC', true,
           '{"interval_minutes": 30, "asset_type": "stock", "timeframe": "15Min"}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE data_source_id = alpaca_ds_id AND name = 'Alpaca Stock Fetch');

    -- Alpaca Crypto Fetch (30-min interval, crypto)
    INSERT INTO worker_fetch_schedules (data_source_id, name, schedule_time, schedule_timezone, is_enabled, fetch_config, created_at, updated_at)
    SELECT alpaca_ds_id, 'Alpaca Crypto Fetch', '00:00:00'::TIME, 'UTC', true,
           '{"interval_minutes": 30, "asset_type": "crypto", "timeframe": "15Min"}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE data_source_id = alpaca_ds_id AND name = 'Alpaca Crypto Fetch');
END $$;

-- 3. Optionally disable TwelveData data source
UPDATE lookup_data_sources SET is_active = false WHERE name = 'TwelveData';

COMMIT;
