# Database - Stock and Crypto Tracker

PostgreSQL database hosted on Supabase.

## Overview

The database serves as the central data store:

- **Data Fetcher Workers** (write): Store fetched stock and crypto price data
- **Analysis Workers** (read/write): Read price data, write analysis results
- **Frontend Service** (read): Query and display data to users
- **AI Agents** (read): Analyze price patterns for trading signals

## Schema Management

Database schema is managed via **EF Core migrations** in:

```
services/common/StockTracker.Data.Migrations/
```

See [EF Migrations CLI](../cli/ef-migrations.md) for commands.

## Tables

| Table                                | Description                                                                 | RLS               |
| ------------------------------------ | --------------------------------------------------------------------------- | ----------------- |
| `universe`                           | Asset types (stock, etf, crypto)                                            | Read-only         |
| `data_sources`                       | 3rd party API configuration                                                 | Service role only |
| `worker_fetch_schedules`             | Worker scheduling & runtime config (links to worker_registry via worker_id) | Service role only |
| `stock_tickers`                      | Stock/ETF master list                                                       | Read-only         |
| `crypto_tickers`                     | Cryptocurrency master list                                                  | Read-only         |
| `stock_prices`                       | 15-minute stock candles                                                     | Read-only         |
| `crypto_prices`                      | 15-minute crypto candles                                                    | Read-only         |
| `analysis_stock_candlestick_pattern` | Daily candlestick pattern analysis                                          | Service role only |
| `worker_registry`                    | Worker discovery for back-office                                            | Service role only |

See [schema.md](schema.md) for detailed table definitions.

## Entity Relationship

```
┌─────────────────┐
│    universe     │
├─────────────────┤
│ id (PK)         │
│ name            │──────┬──────────────────┐
│ is_active       │      │                  │
└─────────────────┘      │                  │
                         ▼                  ▼
┌─────────────────┐    ┌─────────────────────┐
│  stock_tickers  │    │   crypto_tickers    │
├─────────────────┤    ├─────────────────────┤
│ id (PK)         │    │ id (PK)             │
│ universe_id(FK) │    │ universe_id (FK)    │
│ symbol          │    │ symbol              │
│ name            │    │ name                │
│ exchange        │    │ slug                │
└────────┬────────┘    └──────────┬──────────┘
         │                        │
         ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐
│    stock_prices     │  │    crypto_prices    │
├─────────────────────┤  ├─────────────────────┤
│ id (PK)             │  │ id (PK)             │
│ stock_ticker_id(FK) │  │ crypto_ticker_id(FK)│
│ data_source_id (FK) │  │ data_source_id (FK) │
│ price_time          │  │ price_time          │
│ open/high/low/close │  │ open/high/low/close │
│ volume              │  │ volume, market_cap  │
└──────────┬──────────┘  └─────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│ analysis_stock_candlestick_pattern │
├────────────────────────────────────┤
│ id (PK)                            │
│ stock_ticker_id (FK)               │
│ analysis_date                      │
│ daily_open/high/low/close/volume   │
│ body_size, range_size, wicks       │
│ detected_patterns (JSONB)          │
└────────────────────────────────────┘
```

## Connection

### Supabase Dashboard

Access via [Supabase Dashboard](https://supabase.com/dashboard)

### Environment Variables

**Backend (.NET Workers)**:

```
DATABASE_CONNECTION_STRING=Host=...;Port=5432;Database=postgres;Username=postgres;Password=...
Supabase__Url=https://your-project.supabase.co
Supabase__ServiceRoleKey=your-service-role-key
```

**Frontend (Vercel)**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

## Security

All tables have **Row Level Security (RLS)** enabled:

- `data_sources`: No public access (contains API keys)
- All other tables: Public read-only access
- Backend workers use service role key (bypasses RLS)

## Related Documentation

- [Schema Reference](schema.md)
- [EF Migrations CLI](../cli/ef-migrations.md)
- Candlestick analysis is now part of data-fetcher-2.0 (CandlestickAnalysis provider)
