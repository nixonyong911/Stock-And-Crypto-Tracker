# Data-Fetcher Worker Onboarding Runbook

## Overview

This runbook defines all requirements for integrating a new data-fetcher worker with the Stock Tracker system. Following this checklist ensures the worker:

- Is discoverable by the back-office
- Has proper monitoring and metrics
- Can be configured without rebuilds
- Follows established patterns

## Prerequisites

Before starting, ensure you have:

- [ ] Access to Supabase project (for database)
- [ ] Access to Infisical (for secrets)
- [ ] Access to Azure VM (for deployment)
- [ ] Access to Grafana Cloud (for dashboards)
- [ ] Understanding of the external API you're integrating

## 1. Required API Endpoints

Every data-fetcher MUST implement these endpoints:

| Endpoint | Method | Purpose | Example |
|----------|--------|---------|---------|
| `/health/live` | GET | Docker/K8s liveness probe | Returns 200 if process running |
| `/health/ready` | GET | Readiness check | Returns 200 if DB connected |
| `/api/fetch/status` | GET | Return worker config and status | Current schedule, last run |
| `/api/fetch/trigger/{symbol}` | POST | Manual single-symbol fetch | For testing specific symbols |
| `/api/fetch/trigger/all` | POST | Manual batch fetch | For cron jobs and testing |

### Example Response DTOs

```csharp
// Status Response
{
    "service": "YourWorker Stock Fetcher",
    "status": "Running",
    "defaultConfig": {
        "fetchDate": "yesterday",
        "interval": "15min",
        "exchange": "NASDAQ"
    }
}

// Fetch Response
{
    "success": true,
    "message": "Fetched 26 records for symbol AAPL",
    "symbol": "AAPL",
    "date": "2025-12-26",
    "recordsInserted": 26
}

// Batch Fetch Response
{
    "success": true,
    "message": "Batch fetch completed: 8 succeeded, 0 failed",
    "successCount": 8,
    "failedCount": 0,
    "totalRecordsInserted": 208,
    "results": [
        {"symbol": "AAPL", "success": true, "recordsInserted": 26}
    ]
}
```

## 2. Database Requirements

### 2.1 Register in `worker_registry`

```sql
INSERT INTO worker_registry (
    name, 
    display_name, 
    description, 
    service_type, 
    health_endpoint, 
    status_endpoint, 
    config_schema
)
VALUES (
    'yourworker',                              -- Unique identifier
    'YourWorker Stock Fetcher',               -- Display name for UI
    'Fetches stock data from YourWorker API', -- Description
    'data-fetcher',                           -- Service type
    '/api/yourworker/health/live',            -- Health endpoint (with Caddy prefix)
    '/api/yourworker/api/fetch/status',       -- Status endpoint (with Caddy prefix)
    '{
        "schedule": {
            "properties": {
                "schedule_time_utc": {"type": "time", "label": "Schedule Time (UTC)"},
                "is_enabled": {"type": "boolean", "label": "Enabled"}
            }
        },
        "fetch_config": {
            "properties": {
                "exchange": {"type": "select", "options": ["NASDAQ", "NYSE"], "label": "Exchange"},
                "interval": {"type": "select", "options": ["15min", "30min", "1h", "1day"], "label": "Interval"},
                "timezone": {"type": "string", "label": "Timezone", "default": "America/New_York"},
                "output_size": {"type": "number", "label": "Output Size", "default": 30}
            }
        },
        "grafana_panels": [
            {"name": "Worker Status", "panelId": "1", "dashboardUid": "yourworker-details"}
        ]
    }'::jsonb
);
```

### 2.2 Create Data Source Entry

```sql
INSERT INTO data_sources (name, api_url, description)
VALUES (
    'YourWorker',
    'https://api.yourworker.com/v1',
    'YourWorker API for stock data'
);
```

### 2.3 Create `fetch_schedules` Entry

```sql
INSERT INTO fetch_schedules (
    data_source_id,
    name,
    description,
    schedule_time_utc,
    is_enabled,
    fetch_config
)
VALUES (
    (SELECT id FROM data_sources WHERE name = 'YourWorker'),
    'YourWorker Daily Stocks',
    'Daily fetch at market close',
    '22:00:00',
    true,
    '{
        "interval": "15min",
        "outputSize": 30,
        "exchange": "NASDAQ",
        "timezone": "America/New_York",
        "rateLimitDelaySeconds": 8
    }'::jsonb
);
```

### 2.4 Ticker Table

Use existing tables based on asset type:
- Stocks: `stock_tickers`
- Crypto: `crypto_tickers`

## 3. Metrics Requirements

### 3.1 Required Metrics

Use `IMetricsClient` from `StockTracker.Common`:

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `worker_up` | gauge | - | 1 if running, 0 if stopped |
| `worker_info` | gauge | version, worker_name | Version metadata |
| `fetch_operations_total` | counter | symbol, status | Count of fetch attempts |
| `fetch_errors_total` | counter | symbol, error_type | Error breakdown |
| `fetch_duration_seconds` | histogram | symbol | API call latency |
| `records_inserted_total` | counter | symbol | Data volume tracking |

### 3.2 Implementation Example

```csharp
// On worker start
await _metrics.SetGaugeAsync("worker_up", 1);
await _metrics.SetGaugeAsync("worker_info", 1, new Dictionary<string, string>
{
    ["version"] = "1.0.0",
    ["worker_name"] = "yourworker"
});

// On successful fetch
await _metrics.IncrementCounterAsync("fetch_operations_total", 1,
    new Dictionary<string, string>
    {
        ["symbol"] = symbol,
        ["status"] = "success"
    });
await _metrics.IncrementCounterAsync("records_inserted_total", recordCount,
    new Dictionary<string, string> { ["symbol"] = symbol });

// On error
await _metrics.IncrementCounterAsync("fetch_errors_total", 1,
    new Dictionary<string, string>
    {
        ["symbol"] = symbol,
        ["error_type"] = ex.GetType().Name
    });
```

### 3.3 Daily Aggregates (Optional)

For back-office statistics display, upsert to `worker_metrics_daily`:

```sql
INSERT INTO worker_metrics_daily (worker_id, metric_date, api_calls_total, api_calls_success, api_calls_failed, records_inserted)
VALUES (@WorkerId, @Date, @Total, @Success, @Failed, @Records)
ON CONFLICT (worker_id, metric_date) 
DO UPDATE SET 
    api_calls_total = worker_metrics_daily.api_calls_total + @Total,
    api_calls_success = worker_metrics_daily.api_calls_success + @Success,
    api_calls_failed = worker_metrics_daily.api_calls_failed + @Failed,
    records_inserted = worker_metrics_daily.records_inserted + @Records;
```

## 4. Grafana Dashboard

### 4.1 Create Dashboard

Create `grafana/dashboards/yourworker-details.json` with panels for:

| Panel | Type | Query |
|-------|------|-------|
| Worker Status | Stat | `yourworker_worker_up` |
| Fetch Operations | Time series | `rate(yourworker_fetch_operations_total[5m])` |
| Error Rate | Gauge | `rate(errors) / rate(operations) * 100` |
| Records Inserted | Time series | `increase(yourworker_records_inserted_total[1h])` |
| Fetch Duration P95 | Time series | `histogram_quantile(0.95, ...)` |

### 4.2 Configure Panel Embeds

Add panel IDs to `worker_registry.config_schema.grafana_panels`:

```json
{
    "grafana_panels": [
        {"name": "Worker Status", "panelId": "1", "dashboardUid": "yourworker-details"},
        {"name": "Fetch Operations", "panelId": "2", "dashboardUid": "yourworker-details"},
        {"name": "Records Inserted", "panelId": "3", "dashboardUid": "yourworker-details"}
    ]
}
```

## 5. Infrastructure Setup

### 5.1 Caddy Route

Add to `deployment/vm/Caddyfile`:

```
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

### 5.2 Docker Compose

Add to `deployment/vm/docker-compose.yml`:

```yaml
yourworker:
  build:
    context: ./repo/services
    dockerfile: data-fetchers/YourWorker/Dockerfile
  container_name: yourworker
  restart: unless-stopped
  networks:
    - stock-tracker
  environment:
    - ConnectionStrings__DefaultConnection=${DATABASE_CONNECTION_STRING}
    - YourWorker__ApiKey=${YOUR_WORKER_API_KEY}
    - Metrics__ServiceUrl=http://metrics:8080
    - ASPNETCORE_URLS=http://+:8080
    - PATH_BASE=/api/yourworker
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/health/live"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### 5.3 Secrets (Infisical)

Add required secrets to Infisical `prod` environment:
- `YOUR_WORKER_API_KEY`
- Any other API credentials

### 5.4 Update CI/CD Trigger Paths

In `.github/workflows/deploy-vm.yml`, add trigger path:

```yaml
paths:
  - 'services/data-fetchers/YourWorker/**'
```

## 6. Documentation Updates

- [ ] Update `instruction/cli/caddy/worker-endpoints.md` with new routes
- [ ] Update `services/data-fetchers/README.md` with new worker
- [ ] Add worker-specific README at `services/data-fetchers/YourWorker/README.md`

## 7. Verification Checklist

### Pre-Deployment

- [ ] Worker builds successfully
- [ ] Health endpoints respond correctly
- [ ] Fetch endpoints work with test data
- [ ] Metrics are being emitted

### Post-Deployment

```bash
# 1. Check container is running
ssh-azure "docker ps | grep yourworker"

# 2. Check health endpoint
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/health/live

# 3. Test manual fetch
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/api/fetch/trigger/AAPL

# 4. Check metrics
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/metrics | grep yourworker

# 5. Verify in back-office
# Navigate to /back-office/data-fetchers - worker should appear
```

### Database Verification

```sql
-- Check worker is registered
SELECT * FROM worker_registry WHERE name = 'yourworker';

-- Check schedule exists
SELECT * FROM fetch_schedules WHERE name LIKE '%YourWorker%';

-- Check data was fetched
SELECT COUNT(*) FROM stock_prices WHERE data_source_id = (
    SELECT id FROM data_sources WHERE name = 'YourWorker'
);
```

## Related Documentation

- [Data-Fetcher & Back-Office Architecture](../architecture/data-fetcher-backoffice-integration.md)
- [Metrics Specification](../reference/metrics-specification.md)
- [Infisical Secrets Management](../architecture/infisical-secrets-management.md)
- [VM Deployment Architecture](../architecture/vm-deployment-architecture.md)

