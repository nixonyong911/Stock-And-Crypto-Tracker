---
name: data-fetcher
description: Complete requirements and step-by-step guide for creating a new data-fetcher worker that integrates with the Stock Tracker system, including API endpoints, database registration, metrics, Grafana dashboard, and deployment.
triggers:
  - "create new data fetcher"
  - "add new worker"
  - "onboard new API"
  - "new data source"
  - "integrate external API"
---

# Data-Fetcher Worker Skill

## Overview

This skill guides you through creating a new data-fetcher worker that:
- Is discoverable by the back-office UI
- Has proper monitoring and metrics
- Can be configured without rebuilds
- Follows established patterns

## Prerequisites

Before starting, ensure access to:
- [ ] Supabase project (database)
- [ ] Infisical (secrets)
- [ ] Azure VM (deployment)
- [ ] Grafana Cloud (dashboards)
- [ ] Understanding of the external API being integrated

---

## Step 1: Create API Endpoints

Every data-fetcher MUST implement these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health/live` | GET | Liveness probe (returns 200 if running) |
| `/health/ready` | GET | Readiness check (returns 200 if DB connected) |
| `/api/fetch/status` | GET | Worker config and status |
| `/api/fetch/trigger/{symbol}` | POST | Manual single-symbol fetch |
| `/api/fetch/trigger/all` | POST | Manual batch fetch |

### Response DTOs

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
    "successCount": 8,
    "failedCount": 0,
    "totalRecordsInserted": 208,
    "results": [{"symbol": "AAPL", "success": true, "recordsInserted": 26}]
}
```

---

## Step 2: Database Registration

### 2.1 Register in `worker_registry`

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

### 2.2 Create Data Source

```sql
INSERT INTO data_sources (name, api_url, description)
VALUES ('YourWorker', 'https://api.yourworker.com/v1', 'YourWorker API');
```

### 2.3 Create Fetch Schedule

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

## Step 3: Implement Metrics

Use `IMetricsClient` from `StockTracker.Common`:

| Metric | Type | Purpose |
|--------|------|---------|
| `worker_up` | gauge | 1 if running |
| `worker_info` | gauge | Version metadata |
| `fetch_operations_total` | counter | Fetch attempts |
| `fetch_errors_total` | counter | Error breakdown |
| `fetch_duration_seconds` | histogram | API latency |
| `records_inserted_total` | counter | Data volume |

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
    new Dictionary<string, string> { ["symbol"] = symbol, ["status"] = "success" });
```

---

## Step 4: Create Grafana Dashboard

Create `grafana/dashboards/yourworker-details.json` with panels:

| Panel | Type | Query |
|-------|------|-------|
| Worker Status | Stat | `yourworker_worker_up` |
| Fetch Operations | Time series | `rate(yourworker_fetch_operations_total[5m])` |
| Error Rate | Gauge | `rate(errors) / rate(operations) * 100` |
| Records Inserted | Time series | `increase(yourworker_records_inserted_total[1h])` |

---

## Step 5: Infrastructure Setup

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

Add to Infisical `prod` environment:
- `YOUR_WORKER_API_KEY`
- Any other API credentials

### 5.4 CI/CD Trigger

Add to `.github/workflows/deploy-vm.yml`:

```yaml
paths:
  - 'services/data-fetchers/YourWorker/**'
```

---

## Step 6: Documentation Updates

- [ ] Update `instruction/cli/caddy/worker-endpoints.md`
- [ ] Update `services/data-fetchers/README.md`
- [ ] Create `services/data-fetchers/YourWorker/README.md`

---

## Step 7: Verification

### Pre-Deployment

- [ ] Worker builds successfully
- [ ] Health endpoints respond
- [ ] Fetch endpoints work
- [ ] Metrics are emitted

### Post-Deployment

```bash
# Check container
ssh-azure "docker ps | grep yourworker"

# Check health
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/health/live

# Test fetch
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/api/fetch/trigger/AAPL

# Verify in back-office
# Navigate to /back-office/data-fetchers
```

### Database Verification

```sql
SELECT * FROM worker_registry WHERE name = 'yourworker';
SELECT * FROM fetch_schedules WHERE name LIKE '%YourWorker%';
```

---

## Related

- [Data-Fetcher Architecture](../../architecture/data-fetcher-backoffice-integration.md)
- [Metrics Specification](../../reference/metrics-specification.md)
- [Infisical Secrets](../../architecture/infisical-secrets-management.md)

