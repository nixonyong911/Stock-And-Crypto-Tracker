# Data Fetchers

This directory contains all data fetching microservices for the Stock and Crypto Tracker application.

## Architecture

Each data fetcher is an independent .NET 8 ASP.NET Core service that:
- Runs on a configurable schedule using `BackgroundService`
- Fetches data from a specific third-party API
- Stores data in the shared PostgreSQL database
- Pushes metrics to the central Metrics Service
- Exposes REST API for control (trigger, pause, resume)
- Operates independently (can be added/removed without affecting other services)
- Uses shared components from `StockTracker.Common`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Data Fetcher Pattern                             │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │  API Controller │    │ BackgroundWorker│    │  FetchService   │     │
│  │  (REST control) │    │   (Scheduler)   │───▶│  (Business)     │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│           └──────────────────────┼──────────────────────┘               │
│                                  │                                       │
│                    ┌─────────────▼─────────────┐                        │
│                    │   StockTracker.Common     │                        │
│                    │  - IMetricsClient         │                        │
│                    │  - WorkerStateService     │                        │
│                    │  - WorkerHealthCheck      │                        │
│                    └─────────────┬─────────────┘                        │
│                                  │                                       │
│           ┌──────────────────────┼──────────────────────┐               │
│           │                      │                      │               │
│           ▼                      ▼                      ▼               │
│    ┌──────────────┐     ┌──────────────┐      ┌──────────────┐         │
│    │  PostgreSQL  │     │   Metrics    │      │   External   │         │
│    │   Database   │     │   Service    │      │     API      │         │
│    └──────────────┘     └──────────────┘      └──────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Current Services

| Service | Description | API Type | Status |
|---------|-------------|----------|--------|
| TwelveData | Stock market data (10-min candles) | Stock | Active |

## Adding a New Data Fetcher

### 1. Create the Service Directory

```bash
mkdir -p services/data-fetchers/NewService/src/NewService.Worker/{Configuration,Controllers,Models,Repositories,Services,Workers}
```

### 2. Use the Template

Copy the TwelveData service as a template:

```bash
# Copy structure
cp -r services/data-fetchers/TwelveData/* services/data-fetchers/NewService/

# Rename files and update namespaces
# - Rename .csproj file
# - Update namespace references in all .cs files
# - Update solution file
```

### 3. Add Reference to Common Library

In your `.csproj`:
```xml
<ItemGroup>
  <ProjectReference Include="..\..\..\..\common\StockTracker.Common\StockTracker.Common.csproj" />
</ItemGroup>
```

### 4. Configure Services in Program.cs

```csharp
using StockTracker.Common.Metrics;
using StockTracker.Common.Services;

var builder = WebApplication.CreateBuilder(args);

// Add metrics client (pushes to central Metrics Service)
builder.Services.AddMetricsClient(builder.Configuration);

// Add worker state management (pause/resume/trigger)
builder.Services.AddWorkerState();

// Add health checks
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "postgresql", tags: ["db", "ready"])
    .AddWorkerHealthCheck("worker", ["worker", "ready"]);

// Register your services
builder.Services.AddHostedService<DataFetchWorker>();
builder.Services.AddControllers();
```

### 5. Configuration (appsettings.json)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;..."
  },
  "NewService": {
    "ApiKey": "",
    "BaseUrl": "https://api.example.com",
    "FetchIntervalMinutes": 60
  },
  "MetricsService": {
    "BaseUrl": "http://metrics-service:8080",
    "WorkerName": "newservice",
    "Enabled": true,
    "TimeoutSeconds": 5
  }
}
```

### 6. Use Metrics in Your Service

```csharp
public class DataFetchService
{
    private readonly IMetricsClient _metrics;
    private readonly WorkerStateService _workerState;
    
    public async Task FetchDataAsync()
    {
        var stopwatch = Stopwatch.StartNew();
        
        // Record start
        await _metrics.RecordOperationStartedAsync("fetch", 
            new Dictionary<string, string> { ["type"] = "daily" });
        
        try
        {
            _workerState.SetCurrentOperation("Fetching data...");
            
            // Your fetch logic here
            
            stopwatch.Stop();
            await _metrics.RecordOperationCompletedAsync("fetch", 
                stopwatch.Elapsed.TotalSeconds);
            _workerState.SetOperationCompleted();
        }
        catch (Exception ex)
        {
            await _metrics.RecordOperationFailedAsync("fetch", ex.GetType().Name);
            _workerState.SetOperationError();
            throw;
        }
    }
}
```

### 7. Implement Worker with Pause/Resume Support

```csharp
public class DataFetchWorker : BackgroundService
{
    private readonly WorkerStateService _workerState;
    private readonly IMetricsClient _metrics;
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _workerState.SetRunning(true);
        await _metrics.SetWorkerStatusAsync(isRunning: true, isPaused: false);
        
        while (!stoppingToken.IsCancellationRequested)
        {
            // Check for manual trigger
            var wasTriggered = _workerState.ConsumeTrigger();
            
            // Skip if paused (unless manually triggered)
            if (_workerState.IsPaused && !wasTriggered)
            {
                await _metrics.SetWorkerStatusAsync(isRunning: true, isPaused: true);
                await Task.Delay(5000, stoppingToken);
                continue;
            }
            
            // Do fetch work...
            
            // Set next fetch time
            _workerState.SetNextOperationTime(DateTime.UtcNow.AddMinutes(60));
            await Task.Delay(TimeSpan.FromMinutes(60), stoppingToken);
        }
        
        _workerState.SetRunning(false);
    }
}
```

### 8. Register Data Source in Database

Add to `database/init/01-init.sql`:
```sql
INSERT INTO data_sources (name, description, api_type) VALUES
    ('NewService', 'New Service API description', 'stock|crypto|both');
```

### 9. Create Dockerfile

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/NewService.Worker/NewService.Worker.csproj", "NewService.Worker/"]
RUN dotnet restore "NewService.Worker/NewService.Worker.csproj"
COPY src/ .
WORKDIR "/src/NewService.Worker"
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
COPY --from=build /app/publish .
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health/live || exit 1
ENTRYPOINT ["dotnet", "NewService.Worker.dll"]
```

### 10. Add to docker-compose.yml

```yaml
new-service-fetcher:
  build:
    context: ./services/data-fetchers/NewService
    dockerfile: Dockerfile
  container_name: stocktracker-newservice
  restart: unless-stopped
  environment:
    - ConnectionStrings__DefaultConnection=Host=postgres;Port=5432;Database=${POSTGRES_DB:-stocktracker};Username=${POSTGRES_USER:-stocktracker};Password=${POSTGRES_PASSWORD:-stocktracker_pass}
    - NewService__ApiKey=${NEW_SERVICE_API_KEY}
    - NewService__FetchIntervalMinutes=${NEW_SERVICE_FETCH_INTERVAL:-60}
    - MetricsService__BaseUrl=http://metrics-service:8080
    - MetricsService__WorkerName=newservice
    - MetricsService__Enabled=true
  ports:
    - "${NEW_SERVICE_API_PORT:-8083}:8080"
  depends_on:
    postgres:
      condition: service_healthy
    metrics-service:
      condition: service_healthy
  networks:
    - stocktracker-network
```

### 11. Add Environment Variables

Update `.env.example`:
```
NEW_SERVICE_API_KEY=your_api_key_here
NEW_SERVICE_FETCH_INTERVAL=60
NEW_SERVICE_API_PORT=8083
```

## Removing a Data Fetcher

### Option 1: Temporary Disable

Comment out the service in `docker-compose.yml`:
```yaml
# new-service-fetcher:
#   build: ...
```

Then restart:
```bash
docker-compose up -d
```

### Option 2: Permanent Removal

1. Remove from `docker-compose.yml`
2. Remove environment variables from `.env`
3. Optionally delete the service directory
4. Optionally deactivate in database:
```sql
UPDATE data_sources SET is_active = false WHERE name = 'NewService';
```

## Best Practices

### Shared Components
- **Always use** `StockTracker.Common` for metrics and worker state
- **Never** add prometheus-net directly to workers
- **Never** duplicate metrics/worker state code

### API Rate Limiting
- Respect API rate limits with appropriate delays
- Use `Polly` for retry policies
- Log rate limit errors for monitoring

### Error Handling
- Log all errors with context
- Use fetch_logs table for operation tracking
- Continue processing other items on partial failures
- Report errors to metrics service

### Database Operations
- Use upsert (ON CONFLICT) for idempotent operations
- Batch inserts when possible for performance
- Use transactions for related operations

### Configuration
- Use environment variables for all settings
- Provide sensible defaults
- Document all configuration options

## Monitoring

### Via Metrics Service
All worker metrics are aggregated at the central Metrics Service:
- http://localhost:8082/metrics (Prometheus format)
- http://localhost:8082/api/metrics/workers (worker status)

### Via Worker API
Each worker exposes control endpoints:
- `GET /api/fetch/status` - Worker status
- `POST /api/fetch/trigger` - Manual trigger
- `POST /api/fetch/pause` - Pause worker
- `POST /api/fetch/resume` - Resume worker

### Via Database
```sql
-- Recent fetch operations
SELECT 
    ds.name,
    fl.status,
    fl.records_fetched,
    fl.started_at,
    fl.completed_at,
    fl.error_message
FROM fetch_logs fl
JOIN data_sources ds ON fl.data_source_id = ds.id
ORDER BY fl.started_at DESC
LIMIT 20;
```

## Troubleshooting

### Service won't start
1. Check database connectivity
2. Check metrics service connectivity
3. Verify environment variables
4. Check Docker logs: `docker-compose logs new-service-fetcher`

### No data appearing
1. Check fetch_logs for errors
2. Verify API key is valid
3. Confirm data source exists in database
4. Check `/api/fetch/status` endpoint

### Metrics not appearing
1. Ensure Metrics Service is running
2. Check `MetricsService__Enabled` is `true`
3. Verify `MetricsService__BaseUrl` is correct
4. Check Metrics Service logs

### Rate limit errors
1. Increase fetch interval
2. Reduce number of items to fetch
3. Consider API plan upgrade
