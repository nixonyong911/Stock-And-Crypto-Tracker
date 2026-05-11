-- Slice 2: deterministic primary subject ticker on filtered news.
--
-- primary_ticker            : single ticker the row is *about* (subject), uppercase.
-- primary_ticker_source     : provenance tag describing trust tier:
--                               'marketaux_entities' = strong, deterministic from
--                                   MarketAux entity match_score at write time.
--                               NULL                 = no deterministic signal
--                                   (e.g. GNews-only story or empty entities).
--
-- 'batch_heuristic' is NEVER expected on this table; it lives on market memory.

BEGIN;

ALTER TABLE analysis_filtered_news
    ADD COLUMN IF NOT EXISTS primary_ticker TEXT,
    ADD COLUMN IF NOT EXISTS primary_ticker_source TEXT;

CREATE INDEX IF NOT EXISTS idx_filtered_news_primary_ticker
    ON analysis_filtered_news (primary_ticker);

COMMIT;
