# Worker Scheduling Pattern

Database-driven scheduling for data fetcher workers.

## Overview

Workers use the `fetch_schedules` table for:
- **Runtime configuration** - Change fetch parameters without redeployment
- **Schedule management** - Configure when fetches run
- **Run tracking** - Monitor last execution status

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
│                         Data Fetcher Worker                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ FetchWorker │  │ API Client   │  │ FetchSchedule           │ │
│  │ (scheduler) │──│ (HTTP)       │  │ Repository              │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Worker Behavior

1. **Startup** - Wait for database readiness (10s delay)
2. **Load Schedule** - Query `fetch_schedules` joined with `data_sources`
3. **Calculate Delay** - Compute time until `schedule_time_utc`
4. **Wait** - Sleep until scheduled time
5. **Execute Fetch**:
   - Reload fresh config from database
   - Query active tickers
   - Call external API with rate limiting
   - Upsert prices to database
6. **Update Tracking** - Set `last_run_at`, `last_run_status`, `last_run_message`
7. **Loop** - Return to step 2

## Configuration Management

### View Current Config

```sql
SELECT name, schedule_time_utc, fetch_config, last_run_at, last_run_status 
FROM fetch_schedules 
WHERE data_source_id = 1;
```

### Update Schedule Time

```sql
UPDATE fetch_schedules 
SET schedule_time_utc = '23:00', updated_at = CURRENT_TIMESTAMP
WHERE data_source_id = 1;
```

### Update Fetch Parameters

```sql
UPDATE fetch_schedules 
SET fetch_config = jsonb_set(fetch_config, '{output_size}', '50'),
    updated_at = CURRENT_TIMESTAMP
WHERE data_source_id = 1;
```

### Disable Schedule

```sql
UPDATE fetch_schedules 
SET is_enabled = false, updated_at = CURRENT_TIMESTAMP
WHERE data_source_id = 1;
```

## `fetch_config` Parameters

| Field | Description |
|-------|-------------|
| `fetch_date` | API date parameter (`yesterday`, `today`, or specific date) |
| `interval` | Candle interval (`1min`, `5min`, `15min`, `30min`, `1h`, `1day`) |
| `output_size` | Number of candles to fetch (API-specific limits apply) |
| `exchange` | Exchange filter for ticker queries |
| `timezone` | Timezone for API response (converted to UTC before storage) |
| `rate_limit_delay_seconds` | Delay between API calls for rate limiting |

## Implementation

Workers require these components:

| Component | Purpose |
|-----------|---------|
| `FetchSchedule` entity/model | Maps to `fetch_schedules` table |
| `FetchConfig` model | Deserializes JSON config with `[JsonPropertyName]` |
| `IFetchScheduleRepository` | Load schedule, update run status |
| Worker service | Scheduling loop with `CalculateDelayUntilScheduledTime()` |

## Benefits

- **No redeployment** for config changes
- **Centralized management** across all workers
- **Run history** for monitoring and debugging
- **Future admin UI** can manage all schedules

## Related Documentation

- [Database Schema](../database/schema.md) - `fetch_schedules` table definition
- [TwelveData Worker](../../services/data-fetchers/TwelveData/README.md) - Reference implementation

