# Data-Fetcher Worker Patterns

**Last Updated**: 2026-01-01

Standard patterns for creating data-fetcher workers in the Stock Tracker system.

---

## Required API Endpoints

Every data-fetcher MUST implement these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health/live` | GET | Liveness probe (returns 200 if running) |
| `/health/ready` | GET | Readiness check (returns 200 if DB connected) |
| `/api/fetch/status` | GET | Worker config and status |
| `/api/fetch/trigger/{symbol}` | POST | Manual single-symbol fetch |
| `/api/fetch/trigger/all` | POST | Manual batch fetch |

---

## Standard Response DTOs

### Status Response

```json
{
    "service": "YourWorker Stock Fetcher",
    "status": "Running",
    "defaultConfig": {
        "fetchDate": "yesterday",
        "interval": "15min",
        "exchange": "NASDAQ"
    }
}
```

### Fetch Response (Single Symbol)

```json
{
    "success": true,
    "message": "Fetched 26 records for symbol AAPL",
    "symbol": "AAPL",
    "date": "2025-12-26",
    "recordsInserted": 26
}
```

### Batch Fetch Response

```json
{
    "success": true,
    "successCount": 8,
    "failedCount": 0,
    "totalRecordsInserted": 208,
    "results": [
        {
            "symbol": "AAPL",
            "success": true,
            "recordsInserted": 26
        }
    ]
}
```

---

## Database Registration Pattern

### 1. Worker Registry Entry

```sql
INSERT INTO worker_registry (
    name, display_name, description, service_type,
    health_endpoint, status_endpoint, config_schema
)
VALUES (
    'yourworker',
    'YourWorker Stock Fetcher',
    'Fetches stock data from YourWorker API',
    'data-fetcher',
    '/api/yourworker/health/live',
    '/api/yourworker/api/fetch/status',
    '{
        "schedule": {
            "properties": {
                "schedule_time_utc": {"type": "time", "label": "Schedule Time (UTC)"},
                "is_enabled": {"type": "boolean", "label": "Enabled"}
            }
        },
        "fetch_config": {
            "properties": {
                "exchange": {"type": "select", "options": ["NASDAQ", "NYSE"]},
                "interval": {"type": "select", "options": ["15min", "30min", "1h", "1day"]}
            }
        },
        "grafana_panels": [
            {"name": "Worker Status", "panelId": "1", "dashboardUid": "yourworker-details"}
        ]
    }'::jsonb
);
```

### 2. Data Source Entry

```sql
INSERT INTO data_sources (name, api_url, description)
VALUES ('YourWorker', 'https://api.yourworker.com/v1', 'YourWorker API');
```

### 3. Fetch Schedule Entry

```sql
INSERT INTO fetch_schedules (
    data_source_id, name, description, schedule_time_utc, is_enabled, fetch_config
)
VALUES (
    (SELECT id FROM data_sources WHERE name = 'YourWorker'),
    'YourWorker Daily Stocks',
    'Daily fetch at market close',
    '22:00:00',
    true,
    '{"interval": "15min", "outputSize": 30, "exchange": "NASDAQ"}'::jsonb
);
```

---

## Metrics Implementation Pattern

Use `IMetricsClient` from `StockTracker.Common`:

### Standard Metrics

| Metric | Type | Purpose |
|--------|------|---------|
| `worker_up` | gauge | 1 if running |
| `worker_info` | gauge | Version metadata |
| `fetch_operations_total` | counter | Fetch attempts |
| `fetch_errors_total` | counter | Error breakdown |
| `fetch_duration_seconds` | histogram | API latency |
| `records_inserted_total` | counter | Data volume |

### Code Example

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

// On error
await _metrics.IncrementCounterAsync("fetch_errors_total", 1,
    new Dictionary<string, string>
    {
        ["error_type"] = ex.GetType().Name
    });

// Track duration
using var timer = _metrics.StartTimer("fetch_duration_seconds");
// ... perform fetch ...
```

---

## Grafana Dashboard Pattern

Create `grafana/dashboards/yourworker-details.json` with standard panels:

| Panel | Type | Query |
|-------|------|-------|
| Worker Status | Stat | `yourworker_worker_up` |
| Fetch Operations | Time series | `rate(yourworker_fetch_operations_total[5m])` |
| Error Rate | Gauge | `rate(errors) / rate(operations) * 100` |
| Records Inserted | Time series | `increase(yourworker_records_inserted_total[1h])` |

---

## Infrastructure Setup Pattern

### Caddy Route

Add to `deployment/vm/Caddyfile`:

```
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

### Docker Compose Service

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

### Secrets (Infisical)

Add to Infisical `prod` environment:
- `YOUR_WORKER_API_KEY`
- Any other API credentials

### CI/CD Trigger

Add to `.github/workflows/deploy-vm.yml` paths:

```yaml
paths:
  - 'services/data-fetchers/YourWorker/**'
```

---

## Verification Checklist

### Pre-Deployment

- [ ] Worker builds successfully
- [ ] Health endpoints respond (200 OK)
- [ ] Fetch endpoints work with test data
- [ ] Metrics are emitted to Metrics service
- [ ] Database entries created (worker_registry, data_sources, fetch_schedules)

### Post-Deployment Commands

```bash
# Check container running
ssh-azure "docker ps | grep yourworker"

# Check health endpoint
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/health/live

# Check status endpoint
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/api/fetch/status

# Test single symbol fetch
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/api/fetch/trigger/AAPL

# Test batch fetch
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/api/fetch/trigger/all

# Verify in back-office UI
# Navigate to https://nxserver.malaysiawest.cloudapp.azure.com/back-office/data-fetchers
```

### Database Verification Queries

```sql
-- Check worker registry
SELECT * FROM worker_registry WHERE name = 'yourworker';

-- Check data source
SELECT * FROM data_sources WHERE name = 'YourWorker';

-- Check fetch schedule
SELECT * FROM fetch_schedules WHERE name LIKE '%YourWorker%';

-- Check if data is being inserted
SELECT COUNT(*), MAX(timestamp)
FROM stock_data
WHERE data_source_id = (SELECT id FROM data_sources WHERE name = 'YourWorker');
```

---

## Related

- [Data-Fetcher Architecture](../architecture/data-fetcher-backoffice-integration.md)
- [Data-Fetcher Skill](../skills/data-fetcher/SKILL.md)
- [Metrics Specification](./metrics-specification.md)
- [Infisical Secrets Management](../architecture/infisical-secrets-management.md)
- [Infrastructure Config](./infrastructure-config.md)
