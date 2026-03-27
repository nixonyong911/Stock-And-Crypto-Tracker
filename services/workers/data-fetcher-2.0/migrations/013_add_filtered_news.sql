-- Migration: Add analysis_filtered_news table for LLM-processed news insights
-- Date: 2026-03-27
-- Phase 1: Additive only — existing tables unchanged

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_filtered_news (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    impact_level VARCHAR(20) NOT NULL,
    affected_sectors TEXT[],
    affected_tickers TEXT[],
    sentiment VARCHAR(20),
    sentiment_score NUMERIC(5,4),
    key_points TEXT[] NOT NULL,
    market_implications TEXT,
    source_articles JSONB NOT NULL DEFAULT '[]',
    time_range_start TIMESTAMPTZ,
    time_range_end TIMESTAMPTZ,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filtered_news_batch ON analysis_filtered_news(batch_id);
CREATE INDEX IF NOT EXISTS idx_filtered_news_category ON analysis_filtered_news(category, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_filtered_news_impact ON analysis_filtered_news(impact_level, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_filtered_news_processed ON analysis_filtered_news(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_filtered_news_tickers ON analysis_filtered_news USING GIN(affected_tickers);

COMMIT;
