# StockTracker Common Library

Shared library containing common functionality for all Stock and Crypto Tracker workers.

## Overview

This library provides reusable components that all workers can reference, ensuring consistency and reducing code duplication.

## Features

- **Metrics Client**: HTTP client for sending metrics to the central Metrics Service
- **Worker State Management**: Pause/resume/trigger functionality for workers
- **Health Checks**: Reusable health check for worker services

## Installation

Add a project reference to `StockTracker.Common`:

```xml
<ProjectReference Include="..\..\common\StockTracker.Common\StockTracker.Common.csproj" />
```

## Usage

### Metrics Client

```csharp
// In Program.cs - register the metrics client
builder.Services.AddMetricsClient(builder.Configuration);

// Or with explicit options
builder.Services.AddMetricsClient(options =>
{
    options.BaseUrl = "http://metrics-service:8080";
    options.WorkerName = "myworker";
    options.Enabled = true;
});
```

```csharp
// In your service - inject and use
public class MyService
{
    private readonly IMetricsClient _metrics;
    
    public MyService(IMetricsClient metrics)
    {
        _metrics = metrics;
    }
    
    public async Task DoWorkAsync()
    {
        var stopwatch = Stopwatch.StartNew();
        
        await _metrics.RecordOperationStartedAsync("fetch", new Dictionary<string, string>
        {
            ["symbol"] = "AAPL"
        });
        
        try
        {
            // Do work...
            
            stopwatch.Stop();
            await _metrics.RecordOperationCompletedAsync("fetch", stopwatch.Elapsed.TotalSeconds);
        }
        catch (Exception ex)
        {
            await _metrics.RecordOperationFailedAsync("fetch", ex.GetType().Name);
            throw;
        }
    }
}
```

### Configuration

Add to `appsettings.json`:

```json
{
  "MetricsService": {
    "BaseUrl": "http://metrics-service:8080",
    "WorkerName": "alphavantage",
    "Enabled": true,
    "TimeoutSeconds": 5
  }
}
```

### Worker State Service

```csharp
// In Program.cs
builder.Services.AddWorkerState();

// In your worker
public class MyWorker : BackgroundService
{
    private readonly WorkerStateService _workerState;
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _workerState.SetRunning(true);
        
        while (!stoppingToken.IsCancellationRequested)
        {
            // Check for manual trigger
            var wasTriggered = _workerState.ConsumeTrigger();
            
            // Skip if paused (unless manually triggered)
            if (_workerState.IsPaused && !wasTriggered)
            {
                await Task.Delay(5000, stoppingToken);
                continue;
            }
            
            // Do work...
            _workerState.SetCurrentOperation("Fetching data");
            // ...
            _workerState.SetOperationCompleted();
            
            // Wait for next interval
            _workerState.SetNextOperationTime(DateTime.UtcNow.AddMinutes(60));
            await Task.Delay(TimeSpan.FromMinutes(60), stoppingToken);
        }
        
        _workerState.SetRunning(false);
    }
}
```

### Health Checks

```csharp
// In Program.cs
builder.Services.AddHealthChecks()
    .AddWorkerHealthCheck("worker", tags: ["worker", "ready"]);
```

## Available Interfaces

### IMetricsClient

| Method | Description |
|--------|-------------|
| `IncrementCounterAsync` | Increment a counter metric |
| `SetGaugeAsync` | Set a gauge value |
| `ObserveHistogramAsync` | Record a histogram observation |
| `RecordAsync` | Record a generic metric |
| `RecordBatchAsync` | Record multiple metrics efficiently |
| `RecordOperationStartedAsync` | Convenience: record operation start |
| `RecordOperationCompletedAsync` | Convenience: record operation completion with duration |
| `RecordOperationFailedAsync` | Convenience: record operation failure |
| `SetWorkerStatusAsync` | Convenience: set worker running/paused status |

### WorkerStateService

| Method | Description |
|--------|-------------|
| `SetRunning` | Set worker running state |
| `SetPaused` | Set worker paused state |
| `RequestTrigger` | Request immediate execution |
| `ConsumeTrigger` | Check and consume trigger request |
| `SetCurrentOperation` | Set current operation description |
| `SetOperationCompleted` | Mark operation as completed |
| `SetOperationError` | Record operation error |
| `SetNextOperationTime` | Set next scheduled operation time |
| `GetStatus` | Get full worker status |

## Project Structure

```
StockTracker.Common/
├── StockTracker.Common.csproj
├── Metrics/
│   ├── IMetricsClient.cs
│   ├── MetricsClient.cs
│   ├── MetricModels.cs
│   └── MetricsServiceExtensions.cs
└── Services/
    ├── WorkerStateService.cs
    ├── WorkerHealthCheck.cs
    └── WorkerServiceExtensions.cs
```





















