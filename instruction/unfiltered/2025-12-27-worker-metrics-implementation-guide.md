# Worker Metrics Implementation Guide

**Date**: December 27, 2025  
**Status**: Reference Documentation  
**Purpose**: How to add metrics to new workers

---

## Overview

This guide explains how workers should push metrics to the central Metrics Service, which then exposes them to Grafana Cloud via Alloy.

---

## Architecture Flow

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────┐         ┌──────────────┐
│     Worker      │  HTTP   │  Metrics Service │  Scrape │  Alloy  │  Push   │ Grafana Cloud│
│  (TwelveData,   │ ──────► │                  │ ◄────── │         │ ──────► │              │
│   AI-Hub, etc)  │  POST   │  /api/metrics    │         │         │         │  Dashboards  │
└─────────────────┘         └──────────────────┘         └─────────┘         └──────────────┘
        │                            │
        │ Uses IMetricsClient        │ Aggregates & Exposes
        │ from StockTracker.Common   │ Prometheus format
        ▼                            ▼
```

**Key Principle**: Workers PUSH metrics to the Metrics Service. Grafana/Alloy only scrapes the Metrics Service.

---

## Adding Metrics to a New Worker

### Step 1: Add StockTracker.Common Reference

In your worker's `.csproj`:
```xml
<ProjectReference Include="..\..\common\StockTracker.Common\StockTracker.Common.csproj" />
```

### Step 2: Register IMetricsClient

In `Program.cs` or `Startup.cs`:
```csharp
// Add metrics client
builder.Services.AddMetricsClient(options =>
{
    options.MetricsServiceUrl = "http://metrics:8080"; // Docker network
    options.WorkerName = "your-worker-name";
});
```

### Step 3: Inject and Use IMetricsClient

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
            // Your work here...
            await FetchData();
            
            // Record success counter
            await _metrics.IncrementCounterAsync("fetch_operations_total", 
                labels: new { status = "success", symbol = "AAPL" });
        }
        catch (Exception ex)
        {
            // Record failure counter
            await _metrics.IncrementCounterAsync("fetch_operations_total",
                labels: new { status = "error", error_type = ex.GetType().Name });
        }
        finally
        {
            // Record duration histogram
            await _metrics.RecordHistogramAsync("fetch_duration_seconds",
                stopwatch.Elapsed.TotalSeconds,
                labels: new { operation = "fetch_data" });
        }
    }
}
```

### Step 4: Verify Metrics Flow

1. Check worker logs - should show metrics being sent
2. Call `GET /api/metrics/workers` - worker should appear
3. Query in Grafana: `{job="stocktracker-metrics"}`

---

## Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| **Counter** | Monotonically increasing values | Operations count, errors |
| **Gauge** | Values that go up/down | Active connections, queue size |
| **Histogram** | Distribution of values | Request duration, response size |

### Counter Example
```csharp
// Total operations
await _metrics.IncrementCounterAsync("fetch_operations_total",
    labels: new { status = "success" });
```

### Gauge Example
```csharp
// Current active connections
await _metrics.SetGaugeAsync("active_connections", 
    connectionCount,
    labels: new { service = "api" });
```

### Histogram Example
```csharp
// Request duration
await _metrics.RecordHistogramAsync("request_duration_seconds",
    duration.TotalSeconds,
    labels: new { endpoint = "/api/data" });
```

---

## Metric Naming Conventions

Format: `{worker}_{metric_name}_{unit}`

| Good | Bad |
|------|-----|
| `fetch_operations_total` | `FetchOps` |
| `request_duration_seconds` | `requestTime` |
| `api_errors_total` | `errors` |

**Rules**:
- Use snake_case
- Include unit suffix (`_total`, `_seconds`, `_bytes`)
- Be descriptive but concise

---

## Critical Metrics to Implement

### For Every Worker

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `worker_up` | Gauge | `worker_name` | Is worker alive? (1=up, 0=down) |
| `worker_last_heartbeat_timestamp` | Gauge | `worker_name` | When was last activity? |

### For API-Fetching Workers (e.g., TwelveData)

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `fetch_operations_total` | Counter | `status`, `symbol`, `data_source` | Count of fetch attempts |
| `fetch_duration_seconds` | Histogram | `operation`, `symbol` | How long fetches take |
| `fetch_errors_total` | Counter | `error_type`, `symbol` | Count of failures |
| `api_quota_remaining` | Gauge | `data_source` | API rate limit remaining |
| `records_inserted_total` | Counter | `table`, `symbol` | Records saved to DB |

### For Background Workers

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `job_executions_total` | Counter | `job_name`, `status` | Job runs |
| `job_duration_seconds` | Histogram | `job_name` | Job duration |
| `job_last_success_timestamp` | Gauge | `job_name` | Last successful run |

---

## Example: TwelveData Worker Metrics

```csharp
// In StockFetchService.cs

public async Task FetchStockData(string symbol)
{
    // Record attempt
    await _metrics.IncrementCounterAsync("fetch_operations_total",
        labels: new { status = "attempt", symbol, data_source = "twelvedata" });

    var stopwatch = Stopwatch.StartNew();
    
    try
    {
        var data = await _apiClient.GetTimeSeriesAsync(symbol);
        stopwatch.Stop();
        
        // Record success
        await _metrics.IncrementCounterAsync("fetch_operations_total",
            labels: new { status = "success", symbol, data_source = "twelvedata" });
        
        // Record duration
        await _metrics.RecordHistogramAsync("fetch_duration_seconds",
            stopwatch.Elapsed.TotalSeconds,
            labels: new { operation = "api_call", symbol });
        
        // Record records inserted
        var insertedCount = await SaveToDatabase(data);
        await _metrics.IncrementCounterAsync("records_inserted_total",
            value: insertedCount,
            labels: new { table = "stock_prices", symbol });
    }
    catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
    {
        await _metrics.IncrementCounterAsync("fetch_errors_total",
            labels: new { error_type = "rate_limit", symbol });
        throw;
    }
    catch (Exception ex)
    {
        await _metrics.IncrementCounterAsync("fetch_errors_total",
            labels: new { error_type = ex.GetType().Name, symbol });
        throw;
    }
}
```

---

## Grafana Dashboard Queries

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

### Average Fetch Duration
```promql
histogram_quantile(0.95, rate(fetch_duration_seconds_bucket[5m]))
```

### Error Rate by Type
```promql
sum by (error_type) (rate(fetch_errors_total[1h]))
```

---

## Alert Examples (Grafana Cloud)

### Worker Down Alert
```yaml
- alert: WorkerDown
  expr: up{job="stocktracker-metrics"} == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Metrics service is down"
```

### High Error Rate Alert
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

## TODO: Enhancement Tasks

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
| `instruction/cli/caddy/worker-endpoints.md` | Service URLs reference |

