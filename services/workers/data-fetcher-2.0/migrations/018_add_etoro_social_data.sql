-- Migration: eToro Social Intelligence Data Collection
-- Date: 2026-03-31
-- Purpose: Raw data lake for crowd behavior analysis from eToro's 30M+ users.
--          Discovery mode: instruments here may NOT exist in stock_tickers/crypto_tickers.
--          All unfiltered_ tables use INSERT-per-snapshot (not upsert) for time-series.
--          90-day retention, auto-pruned by worker.

BEGIN;

-- ============================================================================
-- 1. Lookup: map eToro instrument_id to human-readable symbol/name
--    UPSERT on each fetch -- always keeps latest metadata
--    Never pruned -- permanent registry of all instruments ever discovered
-- ============================================================================
CREATE TABLE IF NOT EXISTS lookup_etoro_instruments (
    instrument_id INT PRIMARY KEY,
    symbol VARCHAR(50),
    display_name VARCHAR(200),
    instrument_type_id INT,
    instrument_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lookup_etoro_type ON lookup_etoro_instruments(instrument_type_id);
CREATE INDEX IF NOT EXISTS idx_lookup_etoro_symbol ON lookup_etoro_instruments(symbol);

-- ============================================================================
-- 2. Time-series: what instruments are people holding / buying on eToro
--    INSERT per snapshot (new rows every 4h, not upsert)
--    Consumers JOIN to lookup_etoro_instruments for symbol/name
-- ============================================================================
CREATE TABLE IF NOT EXISTS unfiltered_etoro_social_instrument_data (
    id SERIAL PRIMARY KEY,
    instrument_id INT NOT NULL REFERENCES lookup_etoro_instruments(instrument_id),
    holding_pct DECIMAL(10,6),
    buy_holding_pct DECIMAL(5,2),
    sell_holding_pct DECIMAL(5,2),
    buy_pct_change_24h DECIMAL(10,4),
    traders_7day_change DECIMAL(10,4),
    traders_30day_change DECIMAL(10,4),
    popularity_uniques_7day INT,
    daily_price_change DECIMAL(10,4),
    weekly_price_change DECIMAL(10,4),
    monthly_price_change DECIMAL(10,4),
    current_rate DECIMAL(18,6),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(instrument_id, fetched_at)
);

-- ============================================================================
-- 3. Time-series: what do the top 100 investors actually hold?
--    Aggregated per investor per instrument (not per raw position)
--    INSERT per snapshot (new rows every 4h)
-- ============================================================================
CREATE TABLE IF NOT EXISTS unfiltered_etoro_top_investor_positions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    copiers INT,
    gain DECIMAL(10,4),
    win_ratio DECIMAL(5,2),
    risk_score INT,
    instrument_id INT NOT NULL REFERENCES lookup_etoro_instruments(instrument_id),
    is_buy BOOLEAN,
    num_positions INT,
    total_investment_pct DECIMAL(10,6),
    avg_net_profit DECIMAL(10,4),
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. Time-series: eToro curated list snapshots
--    INSERT per snapshot (new rows every 4h)
-- ============================================================================
CREATE TABLE IF NOT EXISTS unfiltered_etoro_curated_lists (
    id SERIAL PRIMARY KEY,
    list_name VARCHAR(200) NOT NULL,
    instrument_id INT NOT NULL REFERENCES lookup_etoro_instruments(instrument_id),
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. Indexes for time-series queries and consumer JOINs
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_uf_etoro_social_fetched ON unfiltered_etoro_social_instrument_data(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_uf_etoro_social_holding ON unfiltered_etoro_social_instrument_data(holding_pct DESC, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_uf_etoro_social_instrument ON unfiltered_etoro_social_instrument_data(instrument_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_uf_etoro_investors_fetched ON unfiltered_etoro_top_investor_positions(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_uf_etoro_investors_instrument ON unfiltered_etoro_top_investor_positions(instrument_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_uf_etoro_curated_fetched ON unfiltered_etoro_curated_lists(fetched_at DESC);

-- ============================================================================
-- 6. Add fetch schedule for the social data worker
-- ============================================================================
DO $$
DECLARE
    etoro_ds_id INT;
BEGIN
    SELECT id INTO etoro_ds_id FROM lookup_data_sources WHERE name = 'eToro' LIMIT 1;

    IF etoro_ds_id IS NOT NULL THEN
        INSERT INTO worker_fetch_schedules (data_source_id, name, schedule_time, schedule_timezone, is_enabled, fetch_config, created_at, updated_at)
        SELECT etoro_ds_id, 'eToro Social Data', '00:00:00'::TIME, 'UTC', true,
               '{"interval_hours": 4, "stocks_pages": 4, "crypto_pages": 4, "top_investors": 100, "retention_days": 90}'::JSONB, NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE name = 'eToro Social Data');
    END IF;
END $$;

COMMIT;
