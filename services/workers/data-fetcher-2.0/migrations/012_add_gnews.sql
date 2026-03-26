-- Migration: Add GNews data source, schedule, analysis table, and combined view
-- Date: 2026-03-26

BEGIN;

-- 1. Add key_points column to MarketAux table (for future LLM summarization)
ALTER TABLE analysis_news_marketaux ADD COLUMN IF NOT EXISTS key_points TEXT;

-- 2. Create analysis_news_gnews table
CREATE TABLE IF NOT EXISTS analysis_news_gnews (
    id BIGSERIAL PRIMARY KEY,
    gnews_id VARCHAR(32) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    content_excerpt TEXT,
    url TEXT NOT NULL,
    image_url TEXT,
    source_name VARCHAR(255),
    source_url TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    search_category VARCHAR(50),
    key_points TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_gnews_published ON analysis_news_gnews(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_gnews_category ON analysis_news_gnews(search_category, published_at DESC);

-- 3. Create combined view across both news sources
CREATE OR REPLACE VIEW analysis_news_combined AS
SELECT 'marketaux' AS source_api, marketaux_uuid AS external_id,
       title, description, snippet AS content_excerpt, url,
       source AS source_name, published_at, search_category,
       key_points, avg_sentiment_score, sentiment_label, created_at
FROM analysis_news_marketaux
UNION ALL
SELECT 'gnews', gnews_id,
       title, description, content_excerpt, url,
       source_name, published_at, search_category,
       key_points, NULL::numeric, NULL::varchar, created_at
FROM analysis_news_gnews;

-- 4. Add GNews data source
INSERT INTO lookup_data_sources (name, base_url, is_active, created_at)
SELECT 'GNews', 'https://gnews.io/api/v4', true, NOW()
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'GNews');

-- 5. Add GNews schedule (every 8 hours)
DO $$
DECLARE
    gnews_ds_id INT;
BEGIN
    SELECT id INTO gnews_ds_id FROM lookup_data_sources WHERE name = 'GNews' LIMIT 1;

    IF gnews_ds_id IS NULL THEN
        RAISE NOTICE 'GNews data source not found, skipping schedule insert';
        RETURN;
    END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, worker_id, name, description, schedule_time, schedule_timezone, is_enabled, interval_minutes, offset_minutes, fetch_config, created_at, updated_at)
    SELECT gnews_ds_id,
           (SELECT id FROM worker_registry WHERE name = 'data-fetcher-2.0'),
           'GNews Headlines Fetch',
           'Fetches top headlines every 8 hours from GNews API. Categories: general (global news), world (international), business (market overview). Free tier: 100 req/day, 12h delay.',
           '00:00:00'::TIME, 'UTC', true, 480, 0,
           '{"daily_request_budget": 90, "cycle_budget": 10, "requests_today": 0, "counter_date": "2026-01-01", "categories": ["general", "world", "business"]}'::JSONB, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM worker_fetch_schedules WHERE name = 'GNews Headlines Fetch');
END $$;

COMMIT;
