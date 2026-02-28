-- ============================================================================
-- analysis_ticker_price_targets: daily pre-computed entry/target/stop-loss
-- prices for all active stock and ETF tickers.
-- Populated by the PriceTargetAnalysis worker in data-fetcher-2.0.
-- Retention: 90 days (aligned with stock_prices).
-- ============================================================================
CREATE TABLE IF NOT EXISTS analysis_ticker_price_targets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker_symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('stock', 'etf', 'crypto')),
    analysis_date DATE NOT NULL,
    latest_close DECIMAL(24,12) NOT NULL,
    entry_price DECIMAL(24,12),
    target_price DECIMAL(24,12),
    stop_loss DECIMAL(24,12),
    signal_summary VARCHAR(50),
    calculation_method VARCHAR(50) DEFAULT 'technical_composite',
    confidence DECIMAL(5,4),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ticker_symbol, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_price_targets_symbol ON analysis_ticker_price_targets(ticker_symbol);
CREATE INDEX IF NOT EXISTS idx_price_targets_date ON analysis_ticker_price_targets(analysis_date);
CREATE INDEX IF NOT EXISTS idx_price_targets_symbol_date ON analysis_ticker_price_targets(ticker_symbol, analysis_date DESC);
