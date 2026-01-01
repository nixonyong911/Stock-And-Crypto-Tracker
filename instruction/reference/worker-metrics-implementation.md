# Worker Metrics Implementation Guide

How to add metrics to any worker. Workers push metrics to the central Metrics Service, which exposes them to Grafana Cloud.

---

## Architecture Flow

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────┐         ┌──────────────┐
│     Worker      │  HTTP   │  Metrics Service │  Scrape │  Alloy  │  Push   │ Grafana Cloud│
│  (TwelveData,   │ ──────► │                  │ ◄────── │         │ ──────► │              │
│   AI-Hub, etc)  │  POST   │  /api/metrics    │         │         │         │  Dashboards  │
└─────────────────┘         └──────────────────┘         └─────────┘         └──────────────┘
```

**Key Principle:** Workers PUSH metrics to the Metrics Service. Grafana/Alloy only scrapes the Metrics Service.

---

## Adding Metrics to a Worker

### Step 1: Add Project Reference

```xml
<ProjectReference Include="..\..\common\StockTracker.Common\StockTracker.Common.csproj" />
```

### Step 2: Register IMetricsClient

```csharp
// Program.cs
builder.Services.AddMetricsClient(options =>
{
    options.MetricsServiceUrl = "http://metrics:8080"; // Docker network
    options.WorkerName = "your-worker-name";
});
```

### Step 3: Use IMetricsClient

```csharp
public class YourService
{
    private readonly IMetricsClient _metrics;

    public YourService(IMetricsClient metrics)
    {
        _metrics = metrics;
    }

    public async Task DoWork()
    {
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            await FetchData();
            
            await _metrics.IncrementCounterAsync("fetch_operations_total", 
                labels: new { status = "success", symbol = "AAPL" });
        }
        catch (Exception ex)
        {
            await _metrics.IncrementCounterAsync("fetch_operations_total",
                labels: new { status = "error", error_type = ex.GetType().Name });
        }
        finally
        {
            await _metrics.RecordHistogramAsync("fetch_duration_seconds",
                stopwatch.Elapsed.TotalSeconds,
                labels: new { operation = "fetch_data" });
        }
    }
}
```

### Step 4: Verify

1. Check worker logs - metrics being sent
2. Call `GET /api/metrics/workers` - worker should appear
3. Query in Grafana: `{job="stocktracker-metrics"}`

---

## Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| **Counter** | Monotonically increasing | Operations count, errors |
| **Gauge** | Values that go up/down | Active connections, queue size |
| **Histogram** | Distribution of values | Request duration, response size |

### Counter

```csharp
await _metrics.IncrementCounterAsync("fetch_operations_total",
    labels: new { status = "success" });
```

### Gauge

```csharp
await _metrics.SetGaugeAsync("active_connections", 
    connectionCount,
    labels: new { service = "api" });
```

### Histogram

```csharp
await _metrics.RecordHistogramAsync("request_duration_seconds",
    duration.TotalSeconds,
    labels: new { endpoint = "/api/data" });
```

---

## Naming Conventions

**Format:** `{metric_name}_{unit}`

| Good | Bad |
|------|-----|
| `fetch_operations_total` | `FetchOps` |
| `request_duration_seconds` | `requestTime` |
| `api_errors_total` | `errors` |

**Rules:**
- Use snake_case
- Include unit suffix (`_total`, `_seconds`, `_bytes`)
- Be descriptive but concise

---

## Critical Metrics

### For Every Worker

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `worker_up` | Gauge | `worker_name` | Is worker alive? (1=up, 0=down) |
| `worker_last_heartbeat_timestamp` | Gauge | `worker_name` | When was last activity? |

### For API-Fetching Workers

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `fetch_operations_total` | Counter | `status`, `symbol`, `data_source` | Fetch attempts |
| `fetch_duration_seconds` | Histogram | `operation`, `symbol` | Fetch timing |
| `fetch_errors_total` | Counter | `error_type`, `symbol` | Failures |
| `api_quota_remaining` | Gauge | `data_source` | Rate limit remaining |
| `records_inserted_total` | Counter | `table`, `symbol` | Records saved |

### For Background Workers

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `job_executions_total` | Counter | `job_name`, `status` | Job runs |
| `job_duration_seconds` | Histogram | `job_name` | Job duration |
| `job_last_success_timestamp` | Gauge | `job_name` | Last successful run |

---

## Grafana Queries

### Service Health

```promql
up{job="stocktracker-metrics"}
```

### Fetch Success Rate (last 1h)

```promql
sum(rate(fetch_operations_total{status="success"}[1h])) 
/ 
sum(rate(fetch_operations_total{status=~"success|error"}[1h])) 
* 100
```

### Average Fetch Duration (p95)

```promql
histogram_quantile(0.95, rate(fetch_duration_seconds_bucket[5m]))
```

### Error Rate by Type

```promql
sum by (error_type) (rate(fetch_errors_total[1h]))
```

---

## Alert Examples

### Worker Down

```yaml
- alert: WorkerDown
  expr: up{job="stocktracker-metrics"} == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Metrics service is down"
```

### High Error Rate

```yaml
- alert: HighFetchErrorRate
  expr: |
    sum(rate(fetch_errors_total[5m])) 
    / 
    sum(rate(fetch_operations_total[5m])) 
    > 0.1
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Fetch error rate > 10%"
```

---

## TODO

### High Priority
- [ ] Add `IMetricsClient` usage to TwelveData worker
- [ ] Implement `fetch_operations_total` metric
- [ ] Implement `fetch_errors_total` metric
- [ ] Add worker heartbeat metric

### Medium Priority
- [ ] Create Grafana Cloud dashboard for worker monitoring
- [ ] Set up alerts for worker down / high error rate
- [ ] Add API quota tracking metrics

### Low Priority
- [ ] Add metrics to AI-Hub service
- [ ] Implement log forwarding to Grafana Loki
- [ ] Create automated alerting escalation

---

## Related Files

| File | Purpose |
|------|---------|
| `services/common/StockTracker.Common/Metrics/` | IMetricsClient interface |
| `services/metrics/StockTracker.Metrics/` | Central metrics service |
| `deployment/vm/alloy-config.alloy` | Grafana Alloy config |
| `instruction/skills/cli-caddy/SKILL.md` | Service URLs reference |



