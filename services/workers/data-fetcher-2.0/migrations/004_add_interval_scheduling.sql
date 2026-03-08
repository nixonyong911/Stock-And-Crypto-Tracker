-- Migration: Add interval scheduling support to worker_fetch_schedules
-- Date: 2026-03-08
-- Purpose: Enable 30-minute interval scheduling for analysis workers (candlestick, indicators, price targets)

BEGIN;

-- 1. Add interval scheduling columns
ALTER TABLE worker_fetch_schedules
  ADD COLUMN IF NOT EXISTS interval_minutes integer,
  ADD COLUMN IF NOT EXISTS offset_minutes integer NOT NULL DEFAULT 0;

-- 2. Set intervals for existing analysis workers
UPDATE worker_fetch_schedules SET interval_minutes = 30, offset_minutes = 5
WHERE name ILIKE '%candlestick%';

UPDATE worker_fetch_schedules SET interval_minutes = 30, offset_minutes = 15
WHERE name ILIKE '%price target%';

-- 3. Add LocalCompute data source
INSERT INTO lookup_data_sources (name, base_url, is_active, created_at)
SELECT 'LocalCompute', '', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'LocalCompute');

-- 4. Add schedule for local indicator computation
DO $$
DECLARE
    lc_ds_id INT;
BEGIN
    SELECT id INTO lc_ds_id FROM lookup_data_sources WHERE name = 'LocalCompute' LIMIT 1;

    IF lc_ds_id IS NULL THEN
        RAISE NOTICE 'LocalCompute data source not found, skipping schedule insert';
        RETURN;
    END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, name, schedule_time, schedule_timezone, is_enabled, interval_minutes, offset_minutes, fetch_config, created_at, updated_at)
    SELECT lc_ds_id, 'Local Indicator Computation', '00:10:00'::TIME, 'UTC', true, 30, 10,
           '{"indicators": ["sma","ema","macd","rsi"]}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE name = 'Local Indicator Computation');
END $$;

-- 5. Disable Massive automatic schedule (keep code for manual backfill)
UPDATE worker_fetch_schedules SET is_enabled = false
WHERE data_source_id = (SELECT id FROM lookup_data_sources WHERE name = 'Massive')
  AND is_enabled = true;

COMMIT;
