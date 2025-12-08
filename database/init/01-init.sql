-- Stock and Crypto Tracker Database Schema
-- PostgreSQL 16

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Data Sources Table
-- Tracks all configured third-party API sources
-- ============================================
CREATE TABLE data_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    api_type VARCHAR(50) NOT NULL, -- 'stock', 'crypto', 'both'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default data sources
INSERT INTO data_sources (name, description, api_type) VALUES
    ('AlphaVantage', 'Alpha Vantage API for stock market data', 'stock');

-- ============================================
-- Stocks Table
-- Master list of tracked stocks
-- ============================================
CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    exchange VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Stock Prices Table
-- Historical and current stock price data
-- ============================================
CREATE TABLE stock_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    price_date DATE NOT NULL,
    open_price DECIMAL(18, 6),
    high_price DECIMAL(18, 6),
    low_price DECIMAL(18, 6),
    close_price DECIMAL(18, 6) NOT NULL,
    adjusted_close DECIMAL(18, 6),
    volume BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate entries for same stock, date, and source
    UNIQUE(stock_id, data_source_id, price_date)
);

-- ============================================
-- Cryptocurrencies Table
-- Master list of tracked cryptocurrencies
-- ============================================
CREATE TABLE cryptocurrencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    slug VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Crypto Prices Table
-- Historical and current cryptocurrency price data
-- ============================================
CREATE TABLE crypto_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crypto_id UUID NOT NULL REFERENCES cryptocurrencies(id) ON DELETE CASCADE,
    data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    price_date DATE NOT NULL,
    price_time TIME WITH TIME ZONE,
    open_price DECIMAL(24, 12),
    high_price DECIMAL(24, 12),
    low_price DECIMAL(24, 12),
    close_price DECIMAL(24, 12) NOT NULL,
    volume DECIMAL(24, 2),
    market_cap DECIMAL(24, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate entries for same crypto, date, and source
    UNIQUE(crypto_id, data_source_id, price_date)
);

-- ============================================
-- Fetch Log Table
-- Track data fetching operations for monitoring
-- ============================================
CREATE TABLE fetch_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    fetch_type VARCHAR(50) NOT NULL, -- 'stock', 'crypto', 'both'
    status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
    records_fetched INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Stock prices indexes
CREATE INDEX idx_stock_prices_stock_id ON stock_prices(stock_id);
CREATE INDEX idx_stock_prices_date ON stock_prices(price_date DESC);
CREATE INDEX idx_stock_prices_stock_date ON stock_prices(stock_id, price_date DESC);
CREATE INDEX idx_stock_prices_source ON stock_prices(data_source_id);

-- Crypto prices indexes
CREATE INDEX idx_crypto_prices_crypto_id ON crypto_prices(crypto_id);
CREATE INDEX idx_crypto_prices_date ON crypto_prices(price_date DESC);
CREATE INDEX idx_crypto_prices_crypto_date ON crypto_prices(crypto_id, price_date DESC);
CREATE INDEX idx_crypto_prices_source ON crypto_prices(data_source_id);

-- Fetch logs indexes
CREATE INDEX idx_fetch_logs_source ON fetch_logs(data_source_id);
CREATE INDEX idx_fetch_logs_status ON fetch_logs(status);
CREATE INDEX idx_fetch_logs_started_at ON fetch_logs(started_at DESC);

-- Stocks and cryptocurrencies indexes
CREATE INDEX idx_stocks_symbol ON stocks(symbol);
CREATE INDEX idx_stocks_active ON stocks(is_active) WHERE is_active = true;
CREATE INDEX idx_crypto_symbol ON cryptocurrencies(symbol);
CREATE INDEX idx_crypto_active ON cryptocurrencies(is_active) WHERE is_active = true;

-- ============================================
-- Trigger for updated_at columns
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_data_sources_updated_at
    BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stocks_updated_at
    BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cryptocurrencies_updated_at
    BEFORE UPDATE ON cryptocurrencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views for Common Queries
-- ============================================

-- Latest stock prices view
CREATE VIEW latest_stock_prices AS
SELECT DISTINCT ON (s.symbol)
    s.id AS stock_id,
    s.symbol,
    s.name AS stock_name,
    s.exchange,
    s.currency,
    sp.price_date,
    sp.open_price,
    sp.high_price,
    sp.low_price,
    sp.close_price,
    sp.adjusted_close,
    sp.volume,
    ds.name AS data_source
FROM stocks s
JOIN stock_prices sp ON s.id = sp.stock_id
JOIN data_sources ds ON sp.data_source_id = ds.id
WHERE s.is_active = true
ORDER BY s.symbol, sp.price_date DESC;

-- Latest crypto prices view
CREATE VIEW latest_crypto_prices AS
SELECT DISTINCT ON (c.symbol)
    c.id AS crypto_id,
    c.symbol,
    c.name AS crypto_name,
    cp.price_date,
    cp.open_price,
    cp.high_price,
    cp.low_price,
    cp.close_price,
    cp.volume,
    cp.market_cap,
    ds.name AS data_source
FROM cryptocurrencies c
JOIN crypto_prices cp ON c.id = cp.crypto_id
JOIN data_sources ds ON cp.data_source_id = ds.id
WHERE c.is_active = true
ORDER BY c.symbol, cp.price_date DESC;

-- ============================================
-- Sample Data (Optional - for testing)
-- ============================================

-- Insert some sample stocks
INSERT INTO stocks (symbol, name, exchange, currency) VALUES
    ('AAPL', 'Apple Inc.', 'NASDAQ', 'USD'),
    ('GOOGL', 'Alphabet Inc.', 'NASDAQ', 'USD'),
    ('MSFT', 'Microsoft Corporation', 'NASDAQ', 'USD'),
    ('AMZN', 'Amazon.com Inc.', 'NASDAQ', 'USD'),
    ('TSLA', 'Tesla Inc.', 'NASDAQ', 'USD');

-- Insert some sample cryptocurrencies
INSERT INTO cryptocurrencies (symbol, name, slug) VALUES
    ('BTC', 'Bitcoin', 'bitcoin'),
    ('ETH', 'Ethereum', 'ethereum'),
    ('SOL', 'Solana', 'solana'),
    ('ADA', 'Cardano', 'cardano'),
    ('DOT', 'Polkadot', 'polkadot');
