-- Migration 010: Add timeframe, is_confirmed, and confidence columns to candlestick pattern tables
-- Supports multi-timeframe analysis (daily/weekly) and pattern confirmation tracking.

-- ============================================================================
-- STOCK CANDLESTICK PATTERN TABLE
-- ============================================================================

ALTER TABLE analysis_stock_candlestick_pattern
    ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT 'daily',
    ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'analysis_stock_candlestick_pattern_timeframe_check'
    ) THEN
        ALTER TABLE analysis_stock_candlestick_pattern
            ADD CONSTRAINT analysis_stock_candlestick_pattern_timeframe_check
            CHECK (timeframe IN ('daily', 'weekly'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'analysis_stock_candlestick_pattern_confidence_check'
    ) THEN
        ALTER TABLE analysis_stock_candlestick_pattern
            ADD CONSTRAINT analysis_stock_candlestick_pattern_confidence_check
            CHECK (confidence >= 0.00 AND confidence <= 1.00);
    END IF;
END $$;

-- Replace the old unique index with one that includes timeframe
DROP INDEX IF EXISTS "IX_analysis_stock_candlestick_pattern_stock_ticker_id_analysis_date";

CREATE UNIQUE INDEX IF NOT EXISTS "IX_analysis_stock_candlestick_pattern_ticker_date_timeframe"
    ON analysis_stock_candlestick_pattern (stock_ticker_id, analysis_date, timeframe);

CREATE INDEX IF NOT EXISTS "IX_analysis_stock_candlestick_pattern_timeframe"
    ON analysis_stock_candlestick_pattern (timeframe);

CREATE INDEX IF NOT EXISTS "IX_analysis_stock_candlestick_pattern_is_confirmed"
    ON analysis_stock_candlestick_pattern (is_confirmed) WHERE is_confirmed = false;

-- ============================================================================
-- CRYPTO CANDLESTICK PATTERN TABLE
-- ============================================================================

ALTER TABLE analysis_crypto_candlestick_pattern
    ADD COLUMN IF NOT EXISTS timeframe TEXT NOT NULL DEFAULT 'daily',
    ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) NOT NULL DEFAULT 1.00;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'analysis_crypto_candlestick_pattern_timeframe_check'
    ) THEN
        ALTER TABLE analysis_crypto_candlestick_pattern
            ADD CONSTRAINT analysis_crypto_candlestick_pattern_timeframe_check
            CHECK (timeframe IN ('daily', 'weekly'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'analysis_crypto_candlestick_pattern_confidence_check'
    ) THEN
        ALTER TABLE analysis_crypto_candlestick_pattern
            ADD CONSTRAINT analysis_crypto_candlestick_pattern_confidence_check
            CHECK (confidence >= 0.00 AND confidence <= 1.00);
    END IF;
END $$;

-- Replace the old unique index with one that includes timeframe
DROP INDEX IF EXISTS "IX_analysis_crypto_candlestick_pattern_crypto_ticker_id_analysis_date";

CREATE UNIQUE INDEX IF NOT EXISTS "IX_analysis_crypto_candlestick_pattern_ticker_date_timeframe"
    ON analysis_crypto_candlestick_pattern (crypto_ticker_id, analysis_date, timeframe);

CREATE INDEX IF NOT EXISTS "IX_analysis_crypto_candlestick_pattern_timeframe"
    ON analysis_crypto_candlestick_pattern (timeframe);

CREATE INDEX IF NOT EXISTS "IX_analysis_crypto_candlestick_pattern_is_confirmed"
    ON analysis_crypto_candlestick_pattern (is_confirmed) WHERE is_confirmed = false;
