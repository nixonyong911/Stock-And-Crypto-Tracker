# Grafana Dashboards

Pre-built dashboards for monitoring Stock and Crypto Tracker workers.

## Dashboards

| Dashboard | File | Description |
|-----------|------|-------------|
| Worker Overview | `dashboards/worker-overview.json` | High-level view of all workers' health and status |
| TwelveData Details | `dashboards/twelvedata-details.json` | Deep dive into TwelveData worker metrics |

## Importing Dashboards

### Via Grafana UI

1. Go to https://stockandcryptotracker.grafana.net/
2. Click **Dashboards** → **New** → **Import**
3. Upload the JSON file or paste its contents
4. Select the Prometheus datasource (`grafanacloud-stockandcryptotracker-prom`)
5. Click **Import**

### Via grafanactl CLI

```bash
# Validate dashboards
grafanactl resources validate -p ./grafana/dashboards/

# Push to Grafana Cloud
grafanactl resources push -p ./grafana/dashboards/
```

## Dashboard Variables

All dashboards use a `datasource` variable that defaults to the Grafana Cloud Prometheus datasource.

## Key Metrics Visualized

### Worker Overview

- Service status (up/down)
- Success rate gauge
- Operations per minute graph
- Records inserted (24h)
- Errors by type pie chart
- Job executions bar gauge

### TwelveData Details

- Worker status and last activity
- Fetch operations over time
- Records inserted per minute
- Fetch duration percentiles (P50, P90, P95, P99)
- Batch duration
- Error breakdown and trends
- Top erroring symbols table

## Customization

To modify dashboards:

1. Edit in Grafana Cloud UI
2. Export as JSON (Dashboard → Settings → JSON Model)
3. Save to `dashboards/` folder
4. Commit to repository

## Related Documentation

- [Metrics Specification](../instruction/reference/metrics-specification.md)
- [Observability Guide](../instruction/reference/observability-guide.md)
- [Grafana CLI Commands](../instruction/cli/grafana/commands.md)

