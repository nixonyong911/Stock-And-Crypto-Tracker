# TwelveData Worker Architecture

TwelveData data fetcher worker implementation with database-driven scheduling and Swagger API support.

---

## Overview

The TwelveData worker is a .NET 8 Web API host that:
- Runs scheduled data fetches via database configuration
- Provides Swagger UI for manual API testing
- Stores 15-minute OHLCV candles in PostgreSQL

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase PostgreSQL                       │
├───────────────────┬───────────────────┬─────────────────────────┤
│   fetch_schedules │   stock_tickers   │     stock_prices        │
│   (schedule/config)│   (symbols)       │     (OHLCV data)        │
└─────────┬─────────┴─────────┬─────────┴───────────┬─────────────┘
          │                   │                     │
          ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TwelveData Worker (Web API)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ FetchWorker │  │ TwelveData   │  │ FetchSchedule           │ │
│  │ (scheduler) │──│ API Client   │  │ Repository              │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐                              │
│  │ Swagger UI  │  │ FetchController │                           │
│  │ (manual test)│  │ (REST API)   │                              │
│  └─────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scheduled Fetching

### Worker Behavior

1. **Startup** - Wait for database readiness (10s delay)
2. **Load Schedule** - Query `fetch_schedules` joined with `data_sources`
3. **Calculate Delay** - Compute time until `schedule_time_utc`
4. **Wait** - Sleep until scheduled time
5. **Execute Fetch**:
   - Reload fresh config from database
   - Query active tickers
   - Call TwelveData API with rate limiting
   - Upsert prices to database
6. **Update Tracking** - Set `last_run_at`, `last_run_status`, `last_run_message`
7. **Loop** - Return to step 2

### Configuration Management

#### View Current Config

```sql
SELECT name, schedule_time_utc, fetch_config, last_run_at, last_run_status 
FROM fetch_schedules 
WHERE data_source_id = 1;
```

#### Update Schedule Time

```sql
UPDATE fetch_schedules 
SET schedule_time_utc = '23:00', updated_at = CURRENT_TIMESTAMP
WHERE data_source_id = 1;
```

#### Update Fetch Parameters

```sql
UPDATE fetch_schedules 
SET fetch_config = jsonb_set(fetch_config, '{output_size}', '50'),
    updated_at = CURRENT_TIMESTAMP
WHERE data_source_id = 1;
```

#### Disable Schedule

```sql
UPDATE fetch_schedules 
SET is_enabled = false, updated_at = CURRENT_TIMESTAMP
WHERE data_source_id = 1;
```

### `fetch_config` Parameters

| Field | Description |
|-------|-------------|
| `fetch_date` | API date parameter (`yesterday`, `today`, or specific date) |
| `interval` | Candle interval (`1min`, `5min`, `15min`, `30min`, `1h`, `1day`) |
| `output_size` | Number of candles to fetch (API-specific limits apply) |
| `exchange` | Exchange filter for ticker queries |
| `timezone` | Timezone for API response (converted to UTC before storage) |
| `rate_limit_delay_seconds` | Delay between API calls for rate limiting |

---

## Swagger API

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/swagger` | GET | Swagger UI |
| `/health` | GET | All health checks |
| `/health/ready` | GET | Ready check (includes DB) |
| `/health/live` | GET | Liveness check |
| `/api/fetch/trigger/{symbol}` | POST | Trigger fetch for symbol |
| `/api/fetch/status` | GET | Service status |

### Manual Fetch Defaults

When using `/api/fetch/trigger/{symbol}`:

| Parameter | Value |
|-----------|-------|
| fetch_date | yesterday |
| interval | 15min |
| output_size | 30 |
| exchange | NASDAQ |
| timezone | America/New_York |

### Example Response

**Success (200 OK)**:
```json
{
  "success": true,
  "message": "Fetched 30 records for symbol AAPL.",
  "symbol": "AAPL",
  "recordsInserted": 30
}
```

**Error (400 Bad Request)**:
```json
{
  "success": false,
  "message": "TwelveData API error: Invalid symbol",
  "symbol": "INVALID"
}
```

---

## Running Locally

### Using Docker Compose

```bash
docker compose --env-file .env.staging up twelvedata-fetcher
```

Access Swagger: `http://localhost:8083/swagger`

Port 8083 is default, override with `TWELVEDATA_API_PORT` env var.

### Using .NET CLI

```bash
cd services/data-fetchers/TwelveData/src/TwelveData.Worker
dotnet run
```

---

## Implementation Components

| Component | Purpose |
|-----------|---------|
| `FetchSchedule` entity | Maps to `fetch_schedules` table |
| `FetchConfig` model | Deserializes JSON config with `[JsonPropertyName]` |
| `IFetchScheduleRepository` | Load schedule, update run status |
| `IStockTickerRepository` | Get or create tickers |
| `IStockFetchService` | Core fetch logic |
| `FetchController` | REST API for manual triggering |

---

## Database Connection

Uses Supabase transaction-mode pooler. Npgsql local pooling is disabled:

```csharp
var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
{
    CommandTimeout = 30,
    Timeout = 15,
    SslMode = SslMode.Require,
    Pooling = false  // Disable local pooling - Supabase has its own pooler
};
```

---

## Notes

- Tickers are auto-created in `stock_tickers` table if they don't exist
- Background worker schedule runs alongside the API
- Requires `TwelveData__ApiKey` environment variable

---

## Related Documentation

- [Database Schema](../database/schema.md) - `fetch_schedules` table definition
- [TwelveData Worker README](../../services/data-fetchers/TwelveData/README.md) - Service documentation
- [Adding Workers to CI/CD](../reference/adding-worker-to-azure-cicd.md) - Deployment guide






