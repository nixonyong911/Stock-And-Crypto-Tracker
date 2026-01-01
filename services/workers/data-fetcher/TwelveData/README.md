# TwelveData Worker

A .NET 8 background worker service that fetches daily OHLC candle data from the [Twelve Data API](https://twelvedata.com/docs#time-series) for NASDAQ stocks.

## Features

- **Database-driven configuration** - Schedule and fetch parameters stored in `fetch_schedules` table
- Daily fetch at configurable time (default: 10 PM UTC / 5 PM ET)
- Uses `date=yesterday` parameter to fetch complete trading day data
- Fetches stock symbols from `stock_tickers` table (filtered by exchange and currency)
- Retrieves 15-minute interval OHLC data via Twelve Data `/time_series` endpoint
- Converts America/New_York timestamps to UTC before storage
- Stores data in `stock_prices` table with proper foreign key references
- Automatic retry policy for transient HTTP failures
- Tracks last run status in database for monitoring

## Architecture

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
│                      TwelveData Worker                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ StockFetch  │  │ TwelveData   │  │ FetchSchedule           │ │
│  │ Worker      │──│ ApiClient    │  │ Repository              │ │
│  │ (scheduler) │  │ (HTTP)       │  │ (load config/update run)│ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWELVE_DATA_API_KEY` | Your Twelve Data API key | Yes |
| `DATABASE_CONNECTION_STRING` | PostgreSQL connection string | Yes |

### Database Configuration (`fetch_schedules` table)

Fetch parameters are stored in the database, allowing runtime configuration without redeployment:

```sql
SELECT * FROM fetch_schedules WHERE data_source_id = 1;
```

| Column | Description | Default |
|--------|-------------|---------|
| `schedule_time_utc` | Time to run daily (UTC) | `22:00` (5 PM ET) |
| `fetch_config` | JSON with fetch parameters | See below |

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

| Field | Description | Default |
|-------|-------------|---------|
| `fetch_date` | API date parameter (`yesterday`, `today`, or specific date) | `yesterday` |
| `interval` | Candle interval (`1min`, `5min`, `15min`, `30min`, `1h`, etc.) | `15min` |
| `output_size` | Number of candles to fetch (1-5000) | `30` |
| `exchange` | Exchange filter | `NASDAQ` |
| `timezone` | Timezone for API response | `America/New_York` |
| `rate_limit_delay_seconds` | Delay between API calls | `8` |

### Modifying Configuration

Update the schedule via SQL:

```sql
-- Change schedule time to 6 PM ET (11 PM UTC)
UPDATE fetch_schedules 
SET schedule_time_utc = '23:00'
WHERE data_source_id = 1;

-- Update fetch config
UPDATE fetch_schedules 
SET fetch_config = '{
  "fetch_date": "yesterday",
  "interval": "15min",
  "output_size": 50,
  "exchange": "NASDAQ",
  "timezone": "America/New_York",
  "rate_limit_delay_seconds": 8
}'::jsonb
WHERE data_source_id = 1;

-- Disable schedule
UPDATE fetch_schedules SET is_enabled = false WHERE data_source_id = 1;
```

## Prerequisites

1. **Database Setup**: Ensure the following tables exist:
   - `data_sources` with a "TwelveData" entry
   - `fetch_schedules` with a schedule linked to TwelveData
   - `stock_tickers` with active stocks

2. **Stock Tickers**: Add stocks to track:

```sql
INSERT INTO stock_tickers (universe_id, symbol, name, exchange, currency)
VALUES 
  (1, 'AAPL', 'Apple Inc.', 'NASDAQ', 'USD'),
  (1, 'MSFT', 'Microsoft Corporation', 'NASDAQ', 'USD');
```

## Running Locally

```bash
cd services/data-fetchers/TwelveData/src/TwelveData.Worker

# Set environment variables
export TWELVE_DATA_API_KEY=your_api_key
export DATABASE_CONNECTION_STRING="Host=...;Port=5432;..."

dotnet run
```

## Running with Docker

```bash
# From project root
docker-compose --env-file .env.staging up twelvedata-fetcher
```

## API Request Format

The worker fetches data from:

```
GET https://api.twelvedata.com/time_series
  ?symbol=AAPL
  &interval=15min
  &exchange=NASDAQ
  &date=yesterday
  &timezone=America/New_York
  &outputsize=30
  &apikey=YOUR_API_KEY
```

## Run Tracking

The worker updates `fetch_schedules` after each run:

| Column | Description |
|--------|-------------|
| `last_run_at` | Timestamp of last execution |
| `last_run_status` | `success`, `partial`, or `failed` |
| `last_run_message` | Summary with record counts and any errors |

Query run history:

```sql
SELECT name, last_run_at, last_run_status, last_run_message 
FROM fetch_schedules 
WHERE data_source_id = 1;
```

## Rate Limiting

The worker includes a configurable delay between API calls (default: 8 seconds) to avoid hitting Twelve Data rate limits. Adjust `rate_limit_delay_seconds` in `fetch_config` based on your API plan tier.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness probe |
| `/api/fetch/trigger/{symbol}` | POST | Fetch single symbol (optional `?date=YYYY-MM-DD`) |
| `/api/fetch/trigger/all` | POST | Fetch all active tickers |
| `/api/fetch/status` | GET | Service configuration |

### Manual Fetch Examples

```bash
# Fetch single symbol (yesterday's data)
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/api/fetch/trigger/AAPL

# Fetch with specific date
curl -X POST "https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/api/fetch/trigger/AAPL?date=2025-12-26"

# Fetch all active tickers
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/api/fetch/trigger/all
```

## Back-Office Integration

The TwelveData worker is integrated with the back-office management system, allowing:

- **No-code configuration**: Enable/disable schedule, modify tickers without rebuild
- **Real-time monitoring**: Grafana panels embedded in back-office UI
- **Manual triggers**: Fetch buttons for testing directly from UI

### Configuration via Back-Office

Navigate to: `/back-office/data-fetchers/twelvedata`

Features:
- Toggle schedule on/off
- View last run status
- Trigger manual fetches
- Enable/disable individual tickers

### Metrics

The worker emits Prometheus-format metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `twelvedata_worker_up` | gauge | 1 if running |
| `twelvedata_fetch_operations_total` | counter | Fetch attempts |
| `twelvedata_records_inserted_total` | counter | Records stored |
| `twelvedata_fetch_duration_seconds` | histogram | API latency |

View metrics: `https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/metrics`

## Troubleshooting

### No data fetched

1. Check `fetch_schedules.is_enabled` is `true`
2. Verify `stock_tickers` has active entries with matching exchange
3. Check `data_sources` has "TwelveData" entry with `is_active = true`
4. Review logs for API errors
5. Check date - market must be open (weekdays, non-holidays)

### Schedule not running

1. Verify current UTC time vs `schedule_time_utc`
2. Check worker logs for schedule loading
3. Ensure database connection is working

### "No data available" API error

1. The date might be a weekend or market holiday
2. The symbol might not exist on the exchange
3. Try a known good date: `?date=2025-12-26` (Friday)

## Related Documentation

- [Data-Fetcher & Back-Office Architecture](../../../instruction/architecture/data-fetcher-backoffice-integration.md)
- [Data-Fetcher Requirements Runbook](../../../instruction/runbooks/data-fetcher-requirements.md)
- [Metrics Specification](../../../instruction/reference/metrics-specification.md)
