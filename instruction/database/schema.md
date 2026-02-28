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

### worker_fetch_schedules

```sql
CREATE TABLE worker_fetch_schedules (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_source_id INT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    worker_id INT REFERENCES worker_registry(id),  -- Links schedule to worker for proper lookup
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
CREATE INDEX ix_worker_fetch_schedules_data_source_id ON worker_fetch_schedules(data_source_id);
CREATE INDEX ix_worker_fetch_schedules_worker_id ON worker_fetch_schedules(worker_id);
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

### analysis_stock_candlestick_pattern

```sql
CREATE TABLE analysis_stock_candlestick_pattern (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_ticker_id INT NOT NULL REFERENCES stock_tickers(id) ON DELETE CASCADE,
    analysis_date DATE NOT NULL,
    
    -- Daily aggregated candle
    daily_open DECIMAL(18,6),
    daily_high DECIMAL(18,6),
    daily_low DECIMAL(18,6),
    daily_close DECIMAL(18,6),
    daily_volume BIGINT,
    
    -- Candle characteristics
    body_size DECIMAL(18,6),
    range_size DECIMAL(18,6),
    upper_wick DECIMAL(18,6),
    lower_wick DECIMAL(18,6),
    is_bullish BOOLEAN,
    
    -- Detected patterns as JSONB
    detected_patterns JSONB NOT NULL DEFAULT '[]',
    
    -- Metadata
    candles_aggregated INT DEFAULT 0,
    analysis_version VARCHAR(20) DEFAULT '1.0.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(stock_ticker_id, analysis_date)
);

-- Indexes
CREATE INDEX idx_analysis_candlestick_date ON analysis_stock_candlestick_pattern(analysis_date);
CREATE INDEX idx_analysis_candlestick_ticker_date ON analysis_stock_candlestick_pattern(stock_ticker_id, analysis_date);
CREATE INDEX idx_analysis_candlestick_patterns ON analysis_stock_candlestick_pattern USING GIN(detected_patterns);
CREATE INDEX idx_analysis_candlestick_bullish ON analysis_stock_candlestick_pattern(analysis_date, is_bullish);
```

#### `detected_patterns` JSON Structure

```json
[
  {
    "pattern": "doji",
    "confidence": 0.92,
    "signal": "indecision",
    "description": "Open and close nearly equal, indicates market indecision"
  },
  {
    "pattern": "hammer",
    "confidence": 0.85,
    "signal": "bullish_reversal",
    "description": "Small body at top with long lower shadow, bullish reversal signal"
  }
]
```

#### Supported Patterns

| Pattern | Signal | Description |
|---------|--------|-------------|
| `doji` | indecision | Open and close nearly equal |
| `long_legged_doji` | indecision | Doji with long shadows both sides |
| `hammer` | bullish_reversal | Small body at top, long lower shadow |
| `inverted_hammer` | bullish_reversal | Small body at bottom, long upper shadow |
| `shooting_star` | bearish_reversal | Same shape as inverted hammer |
| `marubozu_bullish` | strong_bullish | Full body, no shadows |
| `marubozu_bearish` | strong_bearish | Full body, no shadows |
| `spinning_top` | indecision | Small body, shadows both sides |

### analysis_ticker_price_targets

Daily pre-computed entry/target/stop-loss prices for all active stock and ETF tickers. Populated by the PriceTargetAnalysis worker in data-fetcher-2.0. Stocks only for now; crypto support deferred.

```sql
CREATE TABLE analysis_ticker_price_targets (
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

-- Indexes
CREATE INDEX idx_price_targets_symbol ON analysis_ticker_price_targets(ticker_symbol);
CREATE INDEX idx_price_targets_date ON analysis_ticker_price_targets(analysis_date);
CREATE INDEX idx_price_targets_symbol_date ON analysis_ticker_price_targets(ticker_symbol, analysis_date DESC);
```

#### Storage Strategy

- **New row per ticker per day** (INSERT, not upsert per plan). History preserved for range calculations.
- **Retention:** 90 days, aligned with `stock_prices`.

#### Calculation Methodology

| Field | Calculation |
|-------|------------|
| `entry_price` | 60% EMA-20 + 40% 20-day low. RSI > 70 → 2% discount |
| `target_price` | 40% EMA-50 + 60% 20-day high. RSI < 30 → 5% bounce |
| `stop_loss` | min(entry × 0.97, 20-day low × 0.99) |
| `signal_summary` | Majority vote from candlestick signals + RSI zone |
| `confidence` | 0-1 score based on data completeness |

#### `metadata` JSON Structure

```json
{
  "lookback_days": 20,
  "low_20d": 175.50,
  "high_20d": 195.20,
  "ema_20": 182.30,
  "ema_50": 178.90,
  "rsi": 45.2
}
```

### telegram_users

Stores registered Telegram bot users. Users register via Telegram deep link with one-click Yes/No confirmation.

```sql
CREATE TABLE telegram_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,  -- From Telegram API
    display_name VARCHAR(255) NOT NULL,       -- User's first_name from Telegram
    telegram_username VARCHAR(32),            -- Optional @username if set
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON telegram_users FOR ALL USING (true);
```

### telegram_sessions

Stores active user sessions. Sessions expire after 7 days. Single-session policy: new login invalidates all other sessions.

```sql
CREATE TABLE telegram_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    telegram_user_id BIGINT NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    device_info JSONB DEFAULT '{}',           -- Device tracking info
    session_token UUID DEFAULT gen_random_uuid()  -- For future API auth
);
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON telegram_sessions FOR ALL USING (true);

-- Indexes
CREATE INDEX idx_sessions_tg_user ON telegram_sessions(telegram_user_id);
```

#### `device_info` JSON Structure

```json
{
  "language_code": "en",
  "chat_type": "private",
  "is_bot": false
}
```

### telegram_rate_limits

Rate limiting for registration and login attempts.

```sql
CREATE TABLE telegram_rate_limits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    action_type VARCHAR(20) NOT NULL,  -- 'register', 'login'
    attempt_count INT DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(telegram_user_id, action_type)
);
ALTER TABLE telegram_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON telegram_rate_limits FOR ALL USING (true);

-- Indexes
CREATE INDEX idx_rate_limits_user_action ON telegram_rate_limits(telegram_user_id, action_type);
```

#### Rate Limit Configuration

| Action | Max Attempts | Window |
|--------|-------------|--------|
| register | 3 | 60 minutes |
| login | 5 | 15 minutes |

## Data Retention

- **Intraday data (10-min candles)**: 90 days
- **Cleanup job**: Deletes records older than 90 days
- **Telegram sessions**: 7 days (expires_at)
- **Telegram rate limits**: Auto-reset after window expires (no cleanup needed)

## Column Naming Convention

- Database: `snake_case` (e.g., `stock_ticker_id`)
- C# Entity: `PascalCase` (e.g., `StockTickerId`)
- EF Configuration handles mapping

