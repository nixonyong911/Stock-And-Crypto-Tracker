-- Migration: Add FRED economic indicators and release calendar tables
-- Date: 2026-03-13
-- Purpose: Consolidate fred-worker (Go) into data-fetcher-2.0

BEGIN;

-- 1. Create analysis_economic_indicators table
CREATE TABLE IF NOT EXISTS analysis_economic_indicators (
    id SERIAL PRIMARY KEY,
    series_id VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    bullish_when VARCHAR(10) NOT NULL DEFAULT 'up',
    display_mode VARCHAR(50) DEFAULT 'rate',
    display_divisor NUMERIC DEFAULT 1,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    current_value NUMERIC,
    current_observation_date DATE,
    previous_value NUMERIC,
    previous_observation_date DATE,
    change_value NUMERIC,
    change_percent NUMERIC,
    trend VARCHAR(10) DEFAULT 'flat',
    current_signal VARCHAR(10) DEFAULT 'neutral',
    media_current_value NUMERIC,
    media_previous_value NUMERIC,
    yoy_observation_value NUMERIC,
    yoy_observation_date DATE,
    last_release_date DATE,
    last_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_econ_ind_series ON analysis_economic_indicators(series_id);
CREATE INDEX IF NOT EXISTS idx_econ_ind_category ON analysis_economic_indicators(category, display_order);
CREATE INDEX IF NOT EXISTS idx_econ_ind_active ON analysis_economic_indicators(is_active) WHERE is_active = true;

-- 2. Create analysis_release_calendar table
CREATE TABLE IF NOT EXISTS analysis_release_calendar (
    id SERIAL PRIMARY KEY,
    series_id VARCHAR(50) NOT NULL UNIQUE,
    release_id INT NOT NULL,
    release_name VARCHAR(255) NOT NULL,
    next_release_date DATE,
    following_release_date DATE,
    release_frequency VARCHAR(50),
    release_link TEXT,
    last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rel_cal_series ON analysis_release_calendar(series_id);
CREATE INDEX IF NOT EXISTS idx_rel_cal_next ON analysis_release_calendar(next_release_date ASC NULLS LAST);

-- 3. Add FRED data source
INSERT INTO lookup_data_sources (name, base_url, is_active, created_at)
SELECT 'FRED', 'https://api.stlouisfed.org', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'FRED');

-- 4. Add FRED Daily Macro Fetch schedule
DO $$
DECLARE
    fred_ds_id INT;
BEGIN
    SELECT id INTO fred_ds_id FROM lookup_data_sources WHERE name = 'FRED' LIMIT 1;

    IF fred_ds_id IS NULL THEN
        RAISE NOTICE 'FRED data source not found, skipping schedule insert';
        RETURN;
    END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, worker_id, name, description, schedule_time, schedule_timezone, is_enabled, fetch_config, created_at, updated_at)
    SELECT fred_ds_id,
           (SELECT id FROM worker_registry WHERE name = 'data-fetcher-2.0'),
           'FRED Daily Macro Fetch',
           'Fetches latest observations for all active FRED economic indicators daily at 08:00 ET. Includes media-friendly value calculations and release date tracking.',
           '08:00:00'::TIME, 'America/New_York', true,
           '{}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE name = 'FRED Daily Macro Fetch');
END $$;

COMMIT;
