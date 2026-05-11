-- Slice 2: extend unfiltered_news_combined to expose MarketAux per-article
-- entities JSONB (symbols + match_score), which the news-processor needs to
-- compute a deterministic primary_ticker. GNews has no equivalent signal, so
-- gnews rows project NULL::jsonb for entities.
--
-- IMPORTANT: this migration deliberately uses CREATE OR REPLACE VIEW with the
-- new `entities` column APPENDED at the end. Postgres permits appending
-- trailing columns via CREATE OR REPLACE VIEW without breaking dependent
-- views; dependents that used SELECT * (notably analysis_news_combined from
-- migration 014) freeze their column list at creation time and are NOT
-- disturbed by this change.
--
-- Pre-rollout audit (caution from plan): only three consumers exist:
--   1. services/ai/gateway-2.0/src/core/analysis/news-processor.ts -- explicit columns, safe.
--   2. services/mcp/tools/news.py                                  -- explicit columns, safe.
--   3. analysis_news_combined view (migration 014)                 -- SELECT * but frozen.
-- DO NOT use DROP ... CASCADE. If CREATE OR REPLACE VIEW is rejected for any
-- reason, the fallback is an explicit DROP+CREATE pair (analysis_news_combined
-- first, then unfiltered_news_combined) wrapped in a single transaction.

BEGIN;

CREATE OR REPLACE VIEW unfiltered_news_combined AS
SELECT 'marketaux' AS source_api, marketaux_uuid AS external_id,
       title, description, snippet AS content_excerpt, url,
       source AS source_name, published_at, search_category,
       key_points, avg_sentiment_score, sentiment_label, created_at,
       entities
FROM unfiltered_news_marketaux
UNION ALL
SELECT 'gnews', gnews_id,
       title, description, content_excerpt, url,
       source_name, published_at, search_category,
       key_points, NULL::numeric, NULL::varchar, created_at,
       NULL::jsonb AS entities
FROM unfiltered_news_gnews;

COMMIT;
