# Data-Fetcher and Back-Office Integration Architecture

## Overview

This document describes the architecture for integrating data-fetcher workers (like TwelveData) with the back-office management system. The back-office provides a unified interface for configuring, monitoring, and triggering data-fetcher operations.

## System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Back-Office (Next.js)                        │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   Dashboard      │  │  Data Fetchers   │  │   CLI Testing    │ │
│  │   - Health       │  │  - Worker List   │  │   - Claude       │ │
│  │   - Stats        │  │  - Config        │  │   - Cursor       │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘ │
│           │                     │                                   │
│           └──────────┬──────────┘                                   │
│                      │                                              │
└──────────────────────┼──────────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │        Supabase (DB)          │
        │                               │
        │  ┌─────────────────────────┐  │
        │  │    worker_registry      │  │◄─── Worker discovery
        │  │    - name               │  │
        │  │    - health_endpoint    │  │
        │  │    - config_schema      │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │    fetch_schedules      │  │◄─── Schedule config
        │  │    - schedule_time_utc  │  │
        │  │    - is_enabled         │  │
        │  │    - fetch_config       │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │    stock_tickers        │  │◄─── Active tickers
        │  │    - symbol             │  │
        │  │    - is_active          │  │
        │  └─────────────────────────┘  │
        │  ┌─────────────────────────┐  │
        │  │    stock_prices         │  │◄─── Price data
        │  │    - OHLCV candles      │  │
        │  └─────────────────────────┘  │
        └──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Azure VM (Docker)                              │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │   TwelveData     │  │     Metrics      │  │      Caddy       │ │
│  │   Worker         │  │     Service      │  │   (Reverse Proxy)│ │
│  │                  │  │                  │  │                  │ │
│  │ - BackgroundSvc  │  │ - Prometheus     │  │ - /api/twelvedata│ │
│  │ - FetchController│  │   endpoint       │  │ - /api/metrics   │ │
│  │ - API client     │  │ - Aggregation    │  │ - HTTPS/TLS      │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘ │
│           │                     │                                   │
└───────────┼─────────────────────┼───────────────────────────────────┘
            │                     │
            ▼                     ▼
    ┌───────────────┐    ┌───────────────────┐
    │ TwelveData    │    │  Grafana Cloud    │
    │ External API  │    │  - Dashboards     │
    │ - time_series │    │  - Alerts         │
    │ - /stock      │    │  - Visualizations │
    └───────────────┘    └───────────────────┘
```

## Data Flow

### 1. Scheduled Fetch (Daily)

```
1. StockFetchWorker (BackgroundService) runs at scheduled time (22:00 UTC)
2. Loads schedule from worker_fetch_schedules table
3. Gets active tickers from stock_tickers table
4. For each ticker:
   a. Calls TwelveData API /time_series
   b. Parses response and converts to UTC timestamps
   c. Upserts price data to stock_prices table
   d. Records metrics (success/failure, duration, records)
5. Updates worker_fetch_schedules.last_run_status
6. Pushes metrics to Metrics Service
```

### 2. Manual Trigger (API)

```
1. User clicks "Fetch" in back-office OR calls API directly
2. POST /api/twelvedata/api/fetch/trigger/{symbol}
   - OR POST /api/twelvedata/api/fetch/trigger/all
3. FetchController invokes StockFetchService
4. Same fetch logic as scheduled run
5. Returns immediate response with records inserted
```

### 3. Configuration Changes (No-Build)

```
1. User modifies settings in back-office
2. Changes written directly to Supabase:
   - Toggle schedule → fetch_schedules.is_enabled
   - Modify time → fetch_schedules.schedule_time_utc
   - Add/remove ticker → stock_tickers.is_active
3. Worker reads fresh config on next run
4. No deployment or rebuild required
```

## Database Schema Relationships

```
worker_registry (NEW)
       │
       │ References by name
       ▼
data_sources
       │
       │ 1:1
       ▼
fetch_schedules
       │
       │ Contains
       ▼
fetch_config (JSONB)
       │
       │ Configures
       ▼
stock_tickers ◄── Fetch targets
       │
       │ 1:N
       ▼
stock_prices ◄── Fetched data
```

## API Endpoints

### TwelveData Worker

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/twelvedata/health/live` | GET | Liveness probe |
| `/api/twelvedata/health/ready` | GET | Readiness probe |
| `/api/twelvedata/api/fetch/trigger/{symbol}` | POST | Fetch single symbol |
| `/api/twelvedata/api/fetch/trigger/all` | POST | Fetch all active tickers |
| `/api/twelvedata/api/fetch/status` | GET | Service configuration |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `date` | string | "yesterday" | Date to fetch (YYYY-MM-DD or "yesterday") |

## Configuration

### fetch_config (JSONB)

```json
{
  "interval": "15min",
  "outputSize": 30,
  "exchange": "NASDAQ",
  "timezone": "America/New_York",
  "rateLimitDelaySeconds": 8
}
```

### config_schema (worker_registry)

```json
{
  "schedule": {
    "type": "object",
    "properties": {
      "schedule_time_utc": {"type": "time", "label": "Schedule Time (UTC)"},
      "is_enabled": {"type": "boolean", "label": "Enabled"}
    }
  },
  "fetch_config": {
    "type": "object",
    "properties": {
      "exchange": {"type": "select", "options": ["NASDAQ", "NYSE"]},
      "interval": {"type": "select", "options": ["15min", "30min", "1h"]}
    }
  },
  "grafana_panels": [
    {"name": "Worker Status", "panelId": "1", "dashboardUid": "twelvedata-details"}
  ]
}
```

## Monitoring

### Metrics (Prometheus Format)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `worker_up` | gauge | - | 1 if worker running |
| `fetch_operations_total` | counter | symbol, status | Fetch attempt count |
| `records_inserted_total` | counter | symbol | Records written |
| `fetch_duration_seconds` | histogram | symbol | API call duration |
| `fetch_errors_total` | counter | symbol, error_type | Error count |

### Grafana Integration

The back-office embeds Grafana panels via iframe:

```tsx
<iframe
  src="https://stockandcryptotracker.grafana.net/d-solo/twelvedata-details?panelId=1&theme=dark"
  width="100%"
  height="200"
/>
```

## Security Considerations

1. **API Keys**: Stored in Infisical, injected at runtime via environment variables
2. **Database**: RLS enabled, service role key required for data_sources
3. **Rate Limiting**: 8-second delay between API calls to respect TwelveData limits
4. **Health Endpoints**: Unauthenticated (for Docker health checks)
5. **Fetch Endpoints**: Should be protected in production (consider JWT)

## Adding a New Data-Fetcher

See: `instruction/runbooks/data-fetcher-requirements.md`

1. Register in `worker_registry`
2. Create `fetch_schedules` entry
3. Implement required API endpoints
4. Set up metrics
5. Create Grafana dashboard
6. Add Caddy route














