-- Slice 2: deterministic primary subject ticker on market memory.
--
-- primary_ticker            : single ticker the theme is *about* (subject), uppercase.
-- primary_ticker_source     : provenance tag describing trust tier:
--                               'batch_heuristic'    = weak / heuristic, derived at
--                                   curator write time as majority vote over the
--                                   primary_ticker of filtered-news rows in the same
--                                   batch whose affected_tickers overlap this theme.
--                                   Reproducible from the same input batch, but NOT
--                                   source-grounded at the memory layer.
--                               NULL                 = no deterministic signal.
--
-- 'marketaux_entities' is NEVER expected on this table; that tier lives on
-- analysis_filtered_news.

BEGIN;

ALTER TABLE analysis_market_memory
    ADD COLUMN IF NOT EXISTS primary_ticker TEXT,
    ADD COLUMN IF NOT EXISTS primary_ticker_source TEXT;

CREATE INDEX IF NOT EXISTS idx_market_memory_primary_ticker
    ON analysis_market_memory (primary_ticker);

COMMIT;
