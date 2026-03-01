-- Migration 009: Price target parameters config table + trader_type support
-- Adds DB-driven parameters for price target calculator per asset_type and trader_type
-- Adds trader_type, entry_price_low, entry_price_high to analysis_ticker_price_targets

BEGIN;

-- 1. Config table for calculator parameters per asset_type + trader_type
CREATE TABLE IF NOT EXISTS price_target_parameters (
    id SERIAL PRIMARY KEY,
    asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('stock', 'etf', 'crypto')),
    trader_type VARCHAR(20) NOT NULL CHECK (trader_type IN ('day', 'swing', 'long_term')),
    lookback_days INT NOT NULL DEFAULT 20,
    stop_loss_pct DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    overbought_rsi DECIMAL(5,2) NOT NULL DEFAULT 70,
    oversold_rsi DECIMAL(5,2) NOT NULL DEFAULT 30,
    overbought_discount DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    oversold_bounce DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    trend_weight DECIMAL(3,2) NOT NULL DEFAULT 0.40,
    momentum_weight DECIMAL(3,2) NOT NULL DEFAULT 0.30,
    pattern_weight DECIMAL(3,2) NOT NULL DEFAULT 0.30,
    bullish_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.20,
    bearish_threshold DECIMAL(3,2) NOT NULL DEFAULT -0.20,
    entry_range_pct DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_type, trader_type)
);

-- Seed stock profiles
INSERT INTO price_target_parameters (asset_type, trader_type, lookback_days, stop_loss_pct, overbought_rsi, oversold_rsi, overbought_discount, oversold_bounce, trend_weight, momentum_weight, pattern_weight, bullish_threshold, bearish_threshold, entry_range_pct)
VALUES
    ('stock', 'day',       5,  0.0150, 75, 25, 0.0100, 0.0300, 0.40, 0.30, 0.30, 0.20, -0.20, 0.0100),
    ('stock', 'swing',     20, 0.0300, 70, 30, 0.0200, 0.0500, 0.40, 0.30, 0.30, 0.20, -0.20, 0.0200),
    ('stock', 'long_term', 60, 0.0700, 65, 35, 0.0300, 0.0800, 0.40, 0.30, 0.30, 0.20, -0.20, 0.0300)
ON CONFLICT (asset_type, trader_type) DO NOTHING;

-- Seed crypto profiles (wider stop-loss and ranges for higher volatility)
INSERT INTO price_target_parameters (asset_type, trader_type, lookback_days, stop_loss_pct, overbought_rsi, oversold_rsi, overbought_discount, oversold_bounce, trend_weight, momentum_weight, pattern_weight, bullish_threshold, bearish_threshold, entry_range_pct)
VALUES
    ('crypto', 'day',       5,  0.0300, 75, 25, 0.0200, 0.0500, 0.40, 0.30, 0.30, 0.20, -0.20, 0.0200),
    ('crypto', 'swing',     20, 0.0500, 70, 30, 0.0300, 0.0800, 0.40, 0.30, 0.30, 0.20, -0.20, 0.0300),
    ('crypto', 'long_term', 60, 0.1000, 65, 35, 0.0500, 0.1200, 0.40, 0.30, 0.30, 0.20, -0.20, 0.0500)
ON CONFLICT (asset_type, trader_type) DO NOTHING;

-- 2. Add trader_type and entry range columns to price targets table
ALTER TABLE analysis_ticker_price_targets
    ADD COLUMN IF NOT EXISTS trader_type VARCHAR(20) NOT NULL DEFAULT 'swing'
        CHECK (trader_type IN ('day', 'swing', 'long_term')),
    ADD COLUMN IF NOT EXISTS entry_price_low DECIMAL(24,12),
    ADD COLUMN IF NOT EXISTS entry_price_high DECIMAL(24,12);

-- 3. Replace unique constraint to include trader_type
ALTER TABLE analysis_ticker_price_targets
    DROP CONSTRAINT IF EXISTS analysis_ticker_price_targets_ticker_symbol_analysis_date_key;

ALTER TABLE analysis_ticker_price_targets
    ADD CONSTRAINT analysis_ticker_price_targets_symbol_date_trader_key
    UNIQUE(ticker_symbol, analysis_date, trader_type);

COMMIT;
