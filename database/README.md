# Database - Stock and Crypto Tracker

PostgreSQL database schema for the Stock and Crypto Tracker application.

## Overview

The database serves as the central data store for the microservices architecture:
- **Data Fetcher Services** (write): Store fetched stock and crypto data
- **Frontend Service** (read): Query and display data to users

## Schema Structure

### Tables

| Table | Description |
|-------|-------------|
| `data_sources` | Configured third-party API sources (Alpha Vantage, CoinGecko, etc.) |
| `stocks` | Master list of tracked stocks |
| `stock_prices` | Historical and current stock price data |
| `cryptocurrencies` | Master list of tracked cryptocurrencies |
| `crypto_prices` | Historical and current crypto price data |
| `fetch_logs` | Audit trail for data fetching operations |

### Views

| View | Description |
|------|-------------|
| `latest_stock_prices` | Most recent price for each stock |
| `latest_crypto_prices` | Most recent price for each cryptocurrency |

## Entity Relationship

```
┌─────────────────┐     ┌─────────────────┐
│  data_sources   │     │     stocks      │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ name            │     │ symbol          │
│ description     │     │ name            │
│ api_type        │     │ exchange        │
│ is_active       │     │ currency        │
└────────┬────────┘     │ is_active       │
         │              └────────┬────────┘
         │                       │
         │    ┌──────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────┐
│     stock_prices        │
├─────────────────────────┤
│ id (PK)                 │
│ stock_id (FK)           │
│ data_source_id (FK)     │
│ price_date              │
│ open/high/low/close     │
│ volume                  │
└─────────────────────────┘

┌─────────────────┐     ┌─────────────────────┐
│  data_sources   │     │  cryptocurrencies   │
├─────────────────┤     ├─────────────────────┤
│ id (PK)         │     │ id (PK)             │
│ (same as above) │     │ symbol              │
└────────┬────────┘     │ name                │
         │              │ slug                │
         │              │ is_active           │
         │              └──────────┬──────────┘
         │                         │
         │    ┌────────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────┐
│     crypto_prices       │
├─────────────────────────┤
│ id (PK)                 │
│ crypto_id (FK)          │
│ data_source_id (FK)     │
│ price_date              │
│ open/high/low/close     │
│ volume, market_cap      │
└─────────────────────────┘
```

## Initialization

The database is automatically initialized when the PostgreSQL container starts. The initialization script `init/01-init.sql` creates:

1. All tables and relationships
2. Performance indexes
3. Triggers for `updated_at` timestamps
4. Views for common queries
5. Sample data for testing

## Common Queries

### Get Latest Stock Prices
```sql
SELECT * FROM latest_stock_prices;
```

### Get Stock Price History
```sql
SELECT 
    s.symbol,
    sp.price_date,
    sp.close_price,
    sp.volume
FROM stock_prices sp
JOIN stocks s ON sp.stock_id = s.id
WHERE s.symbol = 'AAPL'
ORDER BY sp.price_date DESC
LIMIT 30;
```

### Get Latest Crypto Prices
```sql
SELECT * FROM latest_crypto_prices;
```

### Check Fetch Status
```sql
SELECT 
    ds.name AS source,
    fl.fetch_type,
    fl.status,
    fl.records_fetched,
    fl.started_at,
    fl.completed_at
FROM fetch_logs fl
JOIN data_sources ds ON fl.data_source_id = ds.id
ORDER BY fl.started_at DESC
LIMIT 10;
```

## Adding New Assets

### Add a Stock
```sql
INSERT INTO stocks (symbol, name, exchange, currency)
VALUES ('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'USD');
```

### Add a Cryptocurrency
```sql
INSERT INTO cryptocurrencies (symbol, name, slug)
VALUES ('AVAX', 'Avalanche', 'avalanche');
```

### Add a Data Source
```sql
INSERT INTO data_sources (name, description, api_type)
VALUES ('CoinGecko', 'CoinGecko API for cryptocurrency data', 'crypto');
```

## Maintenance

### Cleanup Old Data
```sql
-- Delete stock prices older than 1 year
DELETE FROM stock_prices
WHERE price_date < CURRENT_DATE - INTERVAL '1 year';

-- Delete old fetch logs
DELETE FROM fetch_logs
WHERE created_at < CURRENT_DATE - INTERVAL '30 days';
```

### Vacuum and Analyze
```sql
VACUUM ANALYZE stock_prices;
VACUUM ANALYZE crypto_prices;
```

## Connection Details

When running via Docker Compose:
- **Host**: `postgres` (internal) or `localhost` (external)
- **Port**: `5432`
- **Database**: `${POSTGRES_DB}`
- **User**: `${POSTGRES_USER}`
- **Password**: `${POSTGRES_PASSWORD}`

Connection string format:
```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
```

