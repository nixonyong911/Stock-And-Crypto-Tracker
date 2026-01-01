# Grafana Dashboard Reference

## Location

Create: `grafana/dashboards/yourworker-details.json`

## Required Panels

| Panel | Type | PromQL Query |
|-------|------|--------------|
| Worker Status | Stat | `yourworker_worker_up` |
| Operations Rate | Time series | `rate(yourworker_fetch_operations_total[5m])` |
| Error Rate | Gauge | `rate(errors[5m]) / rate(operations[5m]) * 100` |
| Records Inserted | Time series | `increase(yourworker_records_inserted_total[1h])` |
| Fetch Duration (p95) | Time series | `histogram_quantile(0.95, rate(yourworker_fetch_duration_seconds_bucket[5m]))` |

## Dashboard Template Structure

```json
{
  "title": "YourWorker Details",
  "uid": "yourworker-details",
  "tags": ["worker", "yourworker"],
  "panels": [
    { "title": "Worker Status", "type": "stat" },
    { "title": "Operations/min", "type": "timeseries" },
    { "title": "Error Rate %", "type": "gauge" },
    { "title": "Records Inserted", "type": "timeseries" }
  ]
}
```

## Import to Grafana Cloud

1. Open Grafana Cloud dashboard
2. Create → Import
3. Upload JSON or paste content
4. Select Prometheus data source

## Related
- [Existing Dashboard](../../../../grafana/dashboards/twelvedata-details.json) - Template reference
- [Metrics Specification](../../../../reference/metrics-specification.md)

