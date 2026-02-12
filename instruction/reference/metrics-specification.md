# Metrics Specification

Standardized metrics specification for all Stock and Crypto Tracker workers. All workers should emit these metrics to enable consistent monitoring and alerting.

---

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────┐         ┌──────────────┐
│     Worker      │  HTTP   │  Metrics Service │  Scrape │  Alloy  │  Push   │ Grafana Cloud│
│  (TwelveData,   │ ──────► │                  │ ◄────── │         │ ──────► │              │
│   gateway-2.0,  │  POST   │  /api/metrics    │         │         │         │  Dashboards  │
└─────────────────┘         └──────────────────┘         └─────────┘         └──────────────┘
```

**Key Principle:** Workers PUSH metrics to the Metrics Service via HTTP. Grafana Alloy scrapes only the Metrics Service.

---

## Metric Types

| Type | Description | Use Case | Example |
|------|-------------|----------|---------|
| **Counter** | Monotonically increasing value | Operations count, errors, records processed | `fetch_operations_total` |
| **Gauge** | Value that can go up or down | Worker status, queue size, connections | `worker_up` |
| **Histogram** | Distribution of values | Request duration, response sizes | `fetch_duration_seconds` |

---

## Naming Convention

```
{worker}_{category}_{name}_{unit}
```

### Rules

1. **All lowercase** with underscores
2. **Worker prefix** identifies the source (e.g., `twelvedata_`, `gateway_`)
3. **Unit suffix** for clarity:
   - `_total` for counters
   - `_seconds` for durations
   - `_bytes` for sizes
   - `_timestamp` for Unix timestamps
4. **No special characters** except underscores

### Examples

| Good | Bad |
|------|-----|
| `twelvedata_fetch_operations_total` | `TwelveDataFetchOps` |
| `gateway_analysis_duration_seconds` | `gateway.analysis.time` |
| `worker_last_activity_timestamp` | `lastActivityTime` |

---

## Standard Metrics (All Workers)

Every worker MUST emit these baseline metrics:

### Health Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `worker_info` | Gauge | `version`, `worker_name` | Always 1, provides metadata via labels |
| `worker_up` | Gauge | - | 1 = running, 0 = stopped/error |
| `worker_last_activity_timestamp` | Gauge | - | Unix timestamp of last successful activity |

### Operation Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `operations_total` | Counter | `operation`, `status` | Count of operations (`status`: success/error) |
| `operation_duration_seconds` | Histogram | `operation` | How long operations take |
| `errors_total` | Counter | `operation`, `error_type` | Error count by type |

### Standard Labels

| Label | Description | Example Values |
|-------|-------------|----------------|
| `status` | Operation outcome | `success`, `error`, `partial` |
| `operation` | What was performed | `fetch`, `insert`, `analyze` |
| `error_type` | Exception/error category | `timeout`, `api_error`, `validation` |

---

## Worker-Specific Metrics

Workers MAY emit additional metrics specific to their function.

### TwelveData Worker

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `fetch_operations_total` | Counter | `symbol`, `status` | Per-symbol fetch count |
| `fetch_duration_seconds` | Histogram | `symbol` | Time to fetch single symbol |
| `fetch_errors_total` | Counter | `symbol`, `error_type` | Errors by symbol and type |
| `records_inserted_total` | Counter | `symbol` | Price records saved to DB |
| `api_quota_remaining` | Gauge | - | TwelveData API calls remaining |
| `symbols_processed_total` | Counter | `exchange` | Symbols processed per exchange |
| `batch_duration_seconds` | Histogram | - | Total batch job duration |

### Background Jobs (Cron)

For cron jobs, use **logs** instead of metrics. However, if metrics are needed:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `job_executions_total` | Counter | `job_name`, `status` | Job run count |
| `job_duration_seconds` | Histogram | `job_name` | Job execution time |
| `job_last_success_timestamp` | Gauge | `job_name` | When job last succeeded |

---

## Implementation Guide

### Step 1: Register IMetricsClient

In your worker's `Program.cs`:

```csharp
using StockTracker.Common.Metrics;

// After other service registrations
builder.Services.AddMetricsClient(builder.Configuration);
```

### Step 2: Add Configuration

In `appsettings.json`:

```json
{
  "MetricsService": {
    "BaseUrl": "http://metrics:8080",
    "WorkerName": "your-worker-name",
    "Enabled": true,
    "TimeoutSeconds": 5
  }
}
```

### Step 3: Inject and Use

```csharp
public class YourService
{
    private readonly IMetricsClient _metrics;

    public YourService(IMetricsClient metrics)
    {
        _metrics = metrics;
    }

    public async Task DoWorkAsync()
    {
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            // Your work here...
            
            await _metrics.IncrementCounterAsync("operations_total", 1,
                new Dictionary<string, string>
                {
                    ["operation"] = "your_operation",
                    ["status"] = "success"
                });
        }
        catch (Exception ex)
        {
            await _metrics.IncrementCounterAsync("errors_total", 1,
                new Dictionary<string, string>
                {
                    ["operation"] = "your_operation",
                    ["error_type"] = ex.GetType().Name
                });
            throw;
        }
        finally
        {
            await _metrics.ObserveHistogramAsync("operation_duration_seconds",
                stopwatch.Elapsed.TotalSeconds,
                new Dictionary<string, string> { ["operation"] = "your_operation" });
        }
    }
}
```

### Step 4: Report Worker Status

In your background worker's `ExecuteAsync`:

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    // Report worker starting
    await _metrics.SetGaugeAsync("worker_up", 1);
    await _metrics.SetGaugeAsync("worker_info", 1,
        new Dictionary<string, string>
        {
            ["version"] = "1.0.0",
            ["worker_name"] = "your-worker"
        });

    while (!stoppingToken.IsCancellationRequested)
    {
        // Update heartbeat
        await _metrics.SetGaugeAsync("worker_last_activity_timestamp", 
            DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        
        // Your work...
    }

    // Report worker stopping
    await _metrics.SetGaugeAsync("worker_up", 0);
}
```

---

## Grafana Queries

### Service Health

```promql
# Is the metrics service up?
up{job="stocktracker-metrics"}

# Is a specific worker up?
twelvedata_worker_up
```

### Success Rates

```promql
# Success rate over 1 hour
sum(rate(twelvedata_fetch_operations_total{status="success"}[1h])) 
/ 
sum(rate(twelvedata_fetch_operations_total[1h])) 
* 100
```

### Duration Percentiles

```promql
# P95 fetch duration
histogram_quantile(0.95, rate(twelvedata_fetch_duration_seconds_bucket[5m]))

# P50 (median) fetch duration
histogram_quantile(0.50, rate(twelvedata_fetch_duration_seconds_bucket[5m]))
```

### Error Analysis

```promql
# Error rate by type
sum by (error_type) (rate(twelvedata_fetch_errors_total[1h]))

# Top 5 erroring symbols
topk(5, sum by (symbol) (rate(twelvedata_fetch_errors_total[1h])))
```

### Throughput

```promql
# Records inserted per hour
sum(increase(twelvedata_records_inserted_total[1h]))

# Operations per minute
sum(rate(twelvedata_fetch_operations_total[5m])) * 60
```

---

## Alert Examples

### Worker Down

```yaml
- alert: WorkerDown
  expr: twelvedata_worker_up == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "TwelveData worker is down"
```

### High Error Rate

```yaml
- alert: HighErrorRate
  expr: |
    sum(rate(twelvedata_fetch_errors_total[5m])) 
    / 
    sum(rate(twelvedata_fetch_operations_total[5m])) 
    > 0.1
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Error rate > 10% for TwelveData worker"
```

### No Activity

```yaml
- alert: WorkerIdle
  expr: |
    time() - twelvedata_worker_last_activity_timestamp > 3600
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "No activity from TwelveData worker in 1 hour"
```

---

## Testing Metrics

### Verify Worker Sends Metrics

```bash
# Check registered workers
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/workers

# Response should include your worker
# {
#   "workerName": "twelvedata",
#   "lastSeen": "2025-12-29T10:30:00Z",
#   "metricsReceivedTotal": 1523,
#   "isHealthy": true
# }
```

### Query in Grafana Cloud

1. Go to https://stockandcryptotracker.grafana.net/
2. Navigate to Explore
3. Select Prometheus data source
4. Query: `{job="stocktracker-metrics", __name__=~"twelvedata.*"}`

---

## Related Files

| File | Purpose |
|------|---------|
| `services/common/StockTracker.Common/Metrics/IMetricsClient.cs` | Client interface |
| `services/common/StockTracker.Common/Metrics/MetricsClient.cs` | HTTP client implementation |
| `services/metrics/StockTracker.Metrics/` | Central metrics service |
| `deployment/vm/alloy-config.alloy` | Grafana Alloy configuration |
| `instruction/architecture/metrics-architecture.md` | Architecture documentation |

