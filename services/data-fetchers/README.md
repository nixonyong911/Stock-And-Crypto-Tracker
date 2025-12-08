# Data Fetchers

This directory contains all data fetching microservices for the Stock and Crypto Tracker application.

## Architecture

Each data fetcher is an independent .NET 8 Worker Service that:
- Runs on a configurable schedule
- Fetches data from a specific third-party API
- Stores data in the shared PostgreSQL database
- Operates independently (can be added/removed without affecting other services)

## Current Services

| Service | Description | API Type | Status |
|---------|-------------|----------|--------|
| AlphaVantage | Stock market data | Stock | Active |

## Adding a New Data Fetcher

### 1. Create the Service Directory

```bash
mkdir -p services/data-fetchers/NewService/src/NewService.Worker/{Configuration,Models,Repositories,Services,Workers}
```

### 2. Use the Template

Copy the AlphaVantage service as a template:

```bash
# Copy structure
cp -r services/data-fetchers/AlphaVantage/* services/data-fetchers/NewService/

# Rename files and update namespaces
# - Rename .csproj file
# - Update namespace references in all .cs files
# - Update solution file
```

### 3. Required Components

Each service should have:

#### Configuration (`Configuration/`)
```csharp
public class NewServiceSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.example.com";
    public int FetchIntervalMinutes { get; set; } = 60;
}
```

#### API Client (`Services/`)
```csharp
public interface INewServiceApiClient
{
    Task<SomeData?> GetDataAsync(CancellationToken cancellationToken = default);
}

public class NewServiceApiClient : INewServiceApiClient
{
    // Implementation
}
```

#### Repository (`Repositories/`)
- Reuse `IDbConnectionFactory` from the template
- Implement data-specific repository interface

#### Worker (`Workers/`)
```csharp
public class DataFetchWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // Fetch and store data
            await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
        }
    }
}
```

### 4. Register Data Source

Add the data source to the database. Either:

1. Add to `database/init/01-init.sql`:
```sql
INSERT INTO data_sources (name, description, api_type) VALUES
    ('NewService', 'New Service API description', 'stock|crypto|both');
```

2. Or insert manually:
```sql
INSERT INTO data_sources (name, description, api_type)
VALUES ('NewService', 'Description', 'crypto');
```

### 5. Create Dockerfile

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
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "NewService.Worker.dll"]
```

### 6. Add to docker-compose.yml

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
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - stocktracker-network
```

### 7. Add Environment Variables

Update `.env.example`:
```
NEW_SERVICE_API_KEY=your_api_key_here
NEW_SERVICE_FETCH_INTERVAL=60
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

### API Rate Limiting
- Respect API rate limits with appropriate delays
- Use `Polly` for retry policies
- Log rate limit errors for monitoring

### Error Handling
- Log all errors with context
- Use fetch_logs table for operation tracking
- Continue processing other items on partial failures

### Database Operations
- Use upsert (ON CONFLICT) for idempotent operations
- Batch inserts when possible for performance
- Use transactions for related operations

### Configuration
- Use environment variables for all settings
- Provide sensible defaults
- Document all configuration options

## Monitoring

Check fetch status via the frontend or database:

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
2. Verify environment variables
3. Check Docker logs: `docker-compose logs new-service-fetcher`

### No data appearing
1. Check fetch_logs for errors
2. Verify API key is valid
3. Confirm data source exists in database

### Rate limit errors
1. Increase fetch interval
2. Reduce number of items to fetch
3. Consider API plan upgrade

