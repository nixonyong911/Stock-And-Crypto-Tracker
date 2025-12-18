# Database Schema Reference

Detailed SQL table definitions. See [README.md](README.md) for overview and entity relationships.

## Table Schemas

### universe

```sql
CREATE TABLE universe (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed data: stock, etf, crypto
```

### stock_tickers

```sql
CREATE TABLE stock_tickers (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    universe_id INT NOT NULL REFERENCES universe(id),
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    exchange VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### crypto_tickers

```sql
CREATE TABLE crypto_tickers (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    universe_id INT NOT NULL REFERENCES universe(id),
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    slug VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### data_sources

```sql
CREATE TABLE data_sources (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    auth_type VARCHAR(50) DEFAULT 'api_key',
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    base_url VARCHAR(500),
    rate_limit_per_minute INT,
    rate_limit_per_day INT,
    timeout_seconds INT DEFAULT 30,
    retry_count INT DEFAULT 3,
    custom_headers JSONB,
    oauth_token_url VARCHAR(500),
    oauth_client_id_encrypted TEXT,
    oauth_client_secret_encrypted TEXT,
    environment VARCHAR(20) DEFAULT 'prod',
    supports_stocks BOOLEAN DEFAULT false,
    supports_crypto BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### fetch_schedules

```sql
CREATE TABLE fetch_schedules (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_source_id INT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    schedule_time_utc TIME NOT NULL DEFAULT '22:00:00',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    fetch_config JSONB NOT NULL DEFAULT '{}',
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(50),
    last_run_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX ix_fetch_schedules_data_source_id ON fetch_schedules(data_source_id);
```

#### `fetch_config` JSON Structure

```json
{
  "fetch_date": "yesterday",
  "interval": "15min",
  "output_size": 30,
  "exchange": "NASDAQ",
  "timezone": "America/New_York",
  "rate_limit_delay_seconds": 8
}
```

### stock_prices (10-Minute Candles)

```sql
CREATE TABLE stock_prices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_ticker_id INT NOT NULL REFERENCES stock_tickers(id) ON DELETE CASCADE,
    data_source_id INT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    price_time TIMESTAMP WITH TIME ZONE NOT NULL,
    open_price DECIMAL(18,6),
    high_price DECIMAL(18,6),
    low_price DECIMAL(18,6),
    close_price DECIMAL(18,6) NOT NULL,
    volume BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(stock_ticker_id, data_source_id, price_time)
);

-- Indexes
CREATE INDEX idx_stock_prices_time ON stock_prices(price_time);
CREATE INDEX idx_stock_prices_ticker_time ON stock_prices(stock_ticker_id, price_time);
```

### crypto_prices (10-Minute Candles)

```sql
CREATE TABLE crypto_prices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_ticker_id INT NOT NULL REFERENCES crypto_tickers(id) ON DELETE CASCADE,
    data_source_id INT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    price_time TIMESTAMP WITH TIME ZONE NOT NULL,
    open_price DECIMAL(24,12),
    high_price DECIMAL(24,12),
    low_price DECIMAL(24,12),
    close_price DECIMAL(24,12) NOT NULL,
    volume DECIMAL(24,2),
    market_cap DECIMAL(24,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(crypto_ticker_id, data_source_id, price_time)
);

-- Indexes
CREATE INDEX idx_crypto_prices_time ON crypto_prices(price_time);
CREATE INDEX idx_crypto_prices_ticker_time ON crypto_prices(crypto_ticker_id, price_time);
```

## Data Retention

- **Intraday data (10-min candles)**: 90 days
- **Cleanup job**: Deletes records older than 90 days

## Column Naming Convention

- Database: `snake_case` (e.g., `stock_ticker_id`)
- C# Entity: `PascalCase` (e.g., `StockTickerId`)
- EF Configuration handles mapping

