-- Migration: Rename raw news tables to unfiltered_news_* and update views
-- Date: 2026-03-27
-- Phase 2: Table renames with backward-compatible views as safety net

BEGIN;

-- 1. Drop the existing combined view (depends on old table names)
DROP VIEW IF EXISTS analysis_news_combined;

-- 2. Rename tables
ALTER TABLE IF EXISTS analysis_news_marketaux RENAME TO unfiltered_news_marketaux;
ALTER TABLE IF EXISTS analysis_news_gnews RENAME TO unfiltered_news_gnews;

-- 3. Create new combined view for unfiltered news (internal use only)
CREATE OR REPLACE VIEW unfiltered_news_combined AS
SELECT 'marketaux' AS source_api, marketaux_uuid AS external_id,
       title, description, snippet AS content_excerpt, url,
       source AS source_name, published_at, search_category,
       key_points, avg_sentiment_score, sentiment_label, created_at
FROM unfiltered_news_marketaux
UNION ALL
SELECT 'gnews', gnews_id,
       title, description, content_excerpt, url,
       source_name, published_at, search_category,
       key_points, NULL::numeric, NULL::varchar, created_at
FROM unfiltered_news_gnews;

-- 4. Create backward-compatible views (safety net during rollout — drop in Phase 3)
CREATE OR REPLACE VIEW analysis_news_marketaux AS
SELECT * FROM unfiltered_news_marketaux;

CREATE OR REPLACE VIEW analysis_news_gnews AS
SELECT * FROM unfiltered_news_gnews;

CREATE OR REPLACE VIEW analysis_news_combined AS
SELECT * FROM unfiltered_news_combined;

COMMIT;
