-- Migration: Add analysis_market_memory table for LLM-curated market themes
-- Date: 2026-03-27
-- The "long-term memory" layer — stores consolidated market themes that
-- the Memory Curator maintains through create / update / decay / archive cycles.

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_market_memory (
    id              BIGSERIAL       PRIMARY KEY,
    theme_id        UUID            NOT NULL UNIQUE,
    theme           TEXT            NOT NULL,
    status          VARCHAR(20)     NOT NULL DEFAULT 'active',
    summary         TEXT            NOT NULL,
    key_facts       TEXT[]          NOT NULL,
    category        VARCHAR(50)     NOT NULL,
    impact_level    VARCHAR(20)     NOT NULL,
    relevance_score NUMERIC(4,3)    NOT NULL DEFAULT 1.000,
    affected_sectors  TEXT[],
    affected_tickers  TEXT[],
    market_implications TEXT,
    sentiment       VARCHAR(20),
    sentiment_score NUMERIC(5,4)    DEFAULT 0,
    first_observed  TIMESTAMPTZ     NOT NULL,
    last_updated    TIMESTAMPTZ     NOT NULL,
    update_count    INT             NOT NULL DEFAULT 1,
    source_batch_ids UUID[],
    price_snapshot_at          TIMESTAMPTZ,
    ticker_prices_at_creation  JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_memory_status_relevance
    ON analysis_market_memory (status, relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_market_memory_category_status
    ON analysis_market_memory (category, status);

CREATE INDEX IF NOT EXISTS idx_market_memory_last_updated
    ON analysis_market_memory (last_updated DESC);

CREATE INDEX IF NOT EXISTS idx_market_memory_tickers
    ON analysis_market_memory USING GIN (affected_tickers);

-- Constraint: status must be one of the valid lifecycle values
ALTER TABLE analysis_market_memory
    ADD CONSTRAINT chk_memory_status
    CHECK (status IN ('active', 'fading', 'archived'));

COMMIT;
