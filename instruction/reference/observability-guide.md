# Observability Guide

How to add metrics and logs to workers in the Stock and Crypto Tracker system.

---

## Two Data Types

| Type | What It Is | Used For | Destination |
|------|------------|----------|-------------|
| **Metrics** | Numbers with labels | "How many?", "How long?", "What rate?" | Grafana Mimir (Prometheus) |
| **Logs** | Text events with timestamps | "What happened?", "What went wrong?" | Grafana Loki |

---

## Metrics vs Logs: When to Use Each

| Scenario | Use | Example |
|----------|-----|---------|
| Count operations | Metrics (Counter) | `fetch_operations_total{status="success"}` |
| Track duration | Metrics (Histogram) | `fetch_duration_seconds` |
| Debug errors | Logs | `"Failed to fetch AAPL: timeout after 30s"` |
| Current state | Metrics (Gauge) | `worker_up`, `queue_size` |
| Audit trail | Logs | `"User X triggered manual fetch"` |
| Alert on thresholds | Metrics | Error rate > 10% |

---

## Adding Metrics to a Worker

### Prerequisites

Your worker must reference the common library:

```xml
<!-- In your .csproj -->
<ProjectReference Include="..\..\common\StockTracker.Common\StockTracker.Common.csproj" />
```

### Step 1: Register IMetricsClient

```csharp
// Program.cs
using StockTracker.Common.Metrics;

var builder = WebApplication.CreateBuilder(args);

// ... other registrations ...

// Add metrics client
builder.Services.AddMetricsClient(builder.Configuration);
```

### Step 2: Configure Metrics Service

```json
// appsettings.json
{
  "MetricsService": {
    "BaseUrl": "http://metrics:8080",
    "WorkerName": "your-worker-name",
    "Enabled": true,
    "TimeoutSeconds": 5
  }
}
```

**Note:** In Docker, use `http://metrics:8080` (Docker network). For local dev, use `http://localhost:8082`.

### Step 3: Inject IMetricsClient

```csharp
public class YourService
{
    private readonly IMetricsClient _metrics;
    private readonly ILogger<YourService> _logger;

    public YourService(IMetricsClient metrics, ILogger<YourService> logger)
    {
        _metrics = metrics;
        _logger = logger;
    }
}
```

### Step 4: Instrument Operations

```csharp
public async Task ProcessItemAsync(string itemId)
{
    var stopwatch = Stopwatch.StartNew();
    
    try
    {
        _logger.LogInformation("Processing item {ItemId}", itemId);
        
        // Your actual work here...
        await DoWorkAsync(itemId);
        
        // Record success
        await _metrics.IncrementCounterAsync("process_operations_total", 1,
            new Dictionary<string, string>
            {
                ["item_id"] = itemId,
                ["status"] = "success"
            });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Failed to process item {ItemId}", itemId);
        
        // Record error
        await _metrics.IncrementCounterAsync("process_errors_total", 1,
            new Dictionary<string, string>
            {
                ["item_id"] = itemId,
                ["error_type"] = ex.GetType().Name
            });
        throw;
    }
    finally
    {
        // Always record duration
        await _metrics.ObserveHistogramAsync("process_duration_seconds",
            stopwatch.Elapsed.TotalSeconds,
            new Dictionary<string, string> { ["item_id"] = itemId });
    }
}
```

### Step 5: Report Worker Health

In your `BackgroundService`:

```csharp
public class YourWorker : BackgroundService
{
    private readonly IMetricsClient _metrics;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Worker starting
        await _metrics.SetGaugeAsync("worker_up", 1);
        await _metrics.SetGaugeAsync("worker_info", 1,
            new Dictionary<string, string>
            {
                ["version"] = "1.0.0",
                ["worker_name"] = "your-worker"
            });

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                // Heartbeat
                await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                // Your work loop...
                await DoWorkAsync(stoppingToken);
            }
        }
        finally
        {
            // Worker stopping
            await _metrics.SetGaugeAsync("worker_up", 0);
        }
    }
}
```

---

## Adding Logs to Grafana Loki

Logs are forwarded via Grafana Alloy. For Docker containers, logs are collected via Docker's logging driver. For VM scripts/cron jobs, use the log file method.

### Method 1: Docker Containers (Recommended for Services)

All Docker containers (including ai-hub2) have logs collected automatically via Docker's logging driver. View logs with:

```bash
docker logs <container-name> -f
docker logs ai-hub2 --tail 100
```

### Method 2: Log Files (For Scripts/Cron Jobs)

If your script writes to a log file:

```bash
#!/bin/bash
# Your script writes to a specific log file
LOG_FILE="/var/log/your-script.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting task..."
# ... your work ...
log "Task completed"
```

Configure Alloy to read the file:

```alloy
// In alloy-config.alloy
local.file_match "your_logs" {
  path_targets = [{
    __path__ = "/var/log/your-script.log",
  }]
}

loki.source.file "your_script" {
  targets    = local.file_match.your_logs.targets
  forward_to = [loki.process.your_script.receiver]
}

loki.process "your_script" {
  stage.static_labels {
    values = {
      job     = "your-script",
      service = "your-script",
      host    = "azure-vm",
    }
  }
  forward_to = [loki.write.grafana_cloud.receiver]
}
```

---

## Querying in Grafana

### Metrics (Prometheus/PromQL)

```promql
# Is service up?
up{job="stocktracker-metrics"}

# Success rate
sum(rate(yourworker_operations_total{status="success"}[1h])) 
/ sum(rate(yourworker_operations_total[1h])) * 100

# P95 latency
histogram_quantile(0.95, rate(yourworker_duration_seconds_bucket[5m]))

# Error breakdown
sum by (error_type) (rate(yourworker_errors_total[1h]))
```

### Logs (Loki/LogQL)

```logql
# All logs from a job
{job="your-service"}

# Filter by text
{job="your-service"} |= "error"

# Exclude patterns
{job="your-service"} != "DEBUG"

# JSON parsing (if logs are JSON)
{job="your-service"} | json | level="error"

# Count errors per minute
sum(rate({job="your-service"} |= "error" [1m]))
```

---

## Checklist: Adding Observability to a New Worker

### Metrics

- [ ] Add `StockTracker.Common` project reference
- [ ] Register `IMetricsClient` in `Program.cs`
- [ ] Add `MetricsService` section to `appsettings.json`
- [ ] Inject `IMetricsClient` in services
- [ ] Add `worker_up` and `worker_info` gauges
- [ ] Add `worker_last_activity_timestamp` heartbeat
- [ ] Add `operations_total` counter with status label
- [ ] Add `operation_duration_seconds` histogram
- [ ] Add `errors_total` counter with error_type label
- [ ] Test: Check `/api/metrics/workers` shows your worker

### Logs

- [ ] Decide: systemd journal OR log file
- [ ] Add Alloy source configuration to `alloy-config.alloy`
- [ ] Set appropriate labels (job, service, host)
- [ ] Deploy updated Alloy config
- [ ] Test: Query in Grafana Loki Explore

---

## Environment-Specific Configuration

| Environment | Metrics BaseUrl | Logs |
|-------------|-----------------|------|
| Docker (VM) | `http://metrics:8080` | Via Alloy in Docker network |
| Local Dev | `http://localhost:8082` | Console only (no Alloy) |

```json
// appsettings.Development.json
{
  "MetricsService": {
    "BaseUrl": "http://localhost:8082",
    "Enabled": false  // Disable in dev if metrics service not running
  }
}
```

---

## Troubleshooting

### Metrics Not Appearing

1. Check worker is sending:
   ```bash
   curl https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/workers
   ```
2. Check Alloy is scraping:
   ```bash
   docker logs alloy --tail 20
   ```
3. Check Grafana Cloud datasource is configured

### Logs Not Appearing in Loki

1. Verify Loki credentials in Infisical:
   - `GRAFANA_CLOUD_LOKI_USER`
   - `GRAFANA_CLOUD_API_KEY`
2. Check Alloy logs:
   ```bash
   docker logs alloy | grep -i loki
   ```
3. Verify log file exists (for file-based):
   ```bash
   ls -la /var/log/your-script.log
   ```

### High Cardinality Warning

Avoid high-cardinality labels (labels with many unique values):

```csharp
// BAD - user_id has millions of values
new Dictionary<string, string> { ["user_id"] = userId }

// GOOD - status has few values
new Dictionary<string, string> { ["status"] = "success" }
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Metrics Specification](metrics-specification.md) | Standard metrics all workers should emit |
| [Metrics Architecture](../architecture/metrics-architecture.md) | Infrastructure details |
| [Metrics Specification](metrics-specification.md) | Detailed metrics specification |
| [Grafana CLI](../cli/grafana/commands.md) | grafanactl commands |

