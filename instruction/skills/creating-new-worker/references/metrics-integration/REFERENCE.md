# Metrics Integration Reference

## 1. Add Project Reference

```xml
<ProjectReference Include="..\..\common\StockTracker.Common\StockTracker.Common.csproj" />
```

## 2. Register IMetricsClient

```csharp
builder.Services.AddMetricsClient(options => {
    options.MetricsServiceUrl = builder.Configuration["MetricsService:BaseUrl"];
    options.WorkerName = "yourworker";
});
```

## 3. Standard Metrics

| Metric | Type | When |
|--------|------|------|
| `worker_up` | gauge | Startup (1) |
| `fetch_operations_total` | counter | After operation |
| `fetch_errors_total` | counter | On error |
| `fetch_duration_seconds` | histogram | After operation |
| `records_inserted_total` | counter | After DB insert |

## 4. Usage

```csharp
await _metrics.SetGaugeAsync("worker_up", 1);

var sw = Stopwatch.StartNew();
try {
    await DoWork();
    await _metrics.IncrementCounterAsync("fetch_operations_total", 
        labels: new { status = "success" });
} catch (Exception ex) {
    await _metrics.IncrementCounterAsync("fetch_errors_total",
        labels: new { error_type = ex.GetType().Name });
} finally {
    await _metrics.RecordHistogramAsync("fetch_duration_seconds", sw.Elapsed.TotalSeconds);
}
```

## Related
- [Worker Metrics Implementation](../../../../reference/worker-metrics-implementation.md)
