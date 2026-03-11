-- Migration: Add MarketAux news data source, schedule, and analysis table
-- Date: 2026-03-11

BEGIN;

-- 1. Create analysis_news_marketaux table
CREATE TABLE IF NOT EXISTS analysis_news_marketaux (
    id BIGSERIAL PRIMARY KEY,
    marketaux_uuid VARCHAR(36) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    snippet TEXT,
    keywords TEXT,
    url TEXT NOT NULL,
    source VARCHAR(255) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    entities JSONB NOT NULL DEFAULT '[]',
    avg_sentiment_score NUMERIC(5,4),
    sentiment_label VARCHAR(20),
    entity_count INTEGER DEFAULT 0,
    search_category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_maux_entities ON analysis_news_marketaux USING GIN(entities jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_news_maux_published ON analysis_news_marketaux(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_maux_sentiment ON analysis_news_marketaux(avg_sentiment_score) WHERE avg_sentiment_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_maux_category ON analysis_news_marketaux(search_category, published_at DESC);

-- 2. Add MarketAux data source
INSERT INTO lookup_data_sources (name, base_url, is_active, created_at)
SELECT 'MarketAux', 'https://api.marketaux.com/v1', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'MarketAux');

-- 3. Add MarketAux News Fetch schedule (every 2 hours, offset 25 min)
DO $$
DECLARE
    maux_ds_id INT;
BEGIN
    SELECT id INTO maux_ds_id FROM lookup_data_sources WHERE name = 'MarketAux' LIMIT 1;

    IF maux_ds_id IS NULL THEN
        RAISE NOTICE 'MarketAux data source not found, skipping schedule insert';
        RETURN;
    END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, worker_id, name, description, schedule_time, schedule_timezone, is_enabled, interval_minutes, offset_minutes, fetch_config, created_at, updated_at)
    SELECT maux_ds_id,
           (SELECT id FROM worker_registry WHERE name = 'data-fetcher-2.0'),
           'MarketAux News Fetch',
           'Fetches market-moving news (Fed, geopolitical, policy, indices) from MarketAux API with built-in sentiment scoring. Runs every 2 hours, 4 queries per cycle.',
           '00:25:00'::TIME, 'UTC', true, 120, 25,
           '{"daily_request_budget": 80, "requests_today": 0, "counter_date": "2026-01-01", "queries": ["macro", "geopolitical", "policy", "market"]}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE name = 'MarketAux News Fetch');
END $$;

COMMIT;
