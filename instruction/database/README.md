# Database - Stock and Crypto Tracker

Self-hosted PostgreSQL 17 on the Azure VM (Docker container `postgres`).
Supabase cloud exists only as a once-daily backup mirror — see
[RUNBOOK.md § Database Topology & Mirror Health](../../RUNBOOK.md) for details.

## Overview

The database serves as the central data store:

- **Data Fetcher Workers** (write): Store fetched stock and crypto price data
- **Analysis Workers** (read/write): Read price data, write analysis results
- **Frontend Service** (read): Query and display data to users
- **AI Agents** (read): Analyze price patterns for trading signals

## Schema Management

Database schema is managed via **SQL migrations** in:

```
services/workers/data-fetcher-2.0/migrations/
```

Migrations are plain `.sql` files applied via `psql` on the VM (`docker exec postgres psql ...`) or directly. EF Core migrations (`StockTracker.Data.Migrations`) have been deleted.

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
- Candlestick analysis is part of data-fetcher-2.0 (CandlestickAnalysis provider)
- All entities use Dapper (not EF Core) in data-fetcher-2.0
