# Alpha Vantage Data Fetcher Service

.NET 8 ASP.NET Core service that fetches stock price data from the Alpha Vantage API and stores it in the PostgreSQL database.

## Overview

This service is part of the Stock and Crypto Tracker microservices architecture. It runs as a background worker that periodically fetches stock price data for configured symbols, with a REST API for control and monitoring.

## Features

- **Scheduled Data Fetching**: Background worker using `BackgroundService`
- **REST API Control**: Trigger, pause, resume fetches via HTTP endpoints
- **Centralized Metrics**: Pushes metrics to the central Metrics Service (no local Prometheus)
- **Health Checks**: Kubernetes-ready health endpoints
- **Swagger UI**: Interactive API documentation
- **Shared Components**: Uses `StockTracker.Common` for metrics and worker state
- **Configurable**: Fetch interval and stock symbols via environment variables
- **Resilience**: Automatic retry with exponential backoff (Polly)

## Architecture

```
┌─────────────────────────┐
│   AlphaVantage Worker   │
│                         │
│  ┌───────────────────┐  │
│  │ StockFetchWorker  │  │
│  │  (Background)     │  │
│  └─────────┬─────────┘  │
│            │            │
│  ┌─────────▼─────────┐  │      ┌──────────────────┐
│  │ StockFetchService │──┼──────▶│ PostgreSQL DB    │
│  └─────────┬─────────┘  │      └──────────────────┘
│            │            │
│  ┌─────────▼─────────┐  │      ┌──────────────────┐
│  │  IMetricsClient   │──┼──────▶│ Metrics Service  │
│  │  (from Common)    │  │      │ POST /api/metrics│
│  └───────────────────┘  │      └──────────────────┘
│                         │
└─────────────────────────┘
```

## API Endpoints

### Control Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info and available endpoints |
| GET | `/api/fetch/status` | Get worker status (running, paused, stats) |
| POST | `/api/fetch/trigger` | Trigger immediate fetch for all symbols |
| POST | `/api/fetch/trigger/{symbol}` | Fetch specific symbol immediately |
| POST | `/api/fetch/pause` | Pause scheduled fetching |
| POST | `/api/fetch/resume` | Resume scheduled fetching |

### Monitoring Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Full health check (DB + worker) |
| `/health/ready` | Readiness probe (for Kubernetes) |
| `/health/live` | Liveness probe (for Kubernetes) |
| `/swagger` | Swagger UI documentation |

### Example API Usage

```bash
# Check worker status
curl http://localhost:8081/api/fetch/status

# Trigger immediate fetch
curl -X POST http://localhost:8081/api/fetch/trigger

# Fetch specific symbol
curl -X POST http://localhost:8081/api/fetch/trigger/NVDA

# Pause worker
curl -X POST http://localhost:8081/api/fetch/pause

# Resume worker
curl -X POST http://localhost:8081/api/fetch/resume
```

## Metrics

This service pushes metrics to the central Metrics Service. Metrics are NOT exposed locally.

Metrics pushed:
- `alphavantage_fetch_total` - Fetch operations by symbol and status
- `alphavantage_fetch_duration_seconds` - Fetch duration histogram
- `alphavantage_records_fetched_total` - Records fetched count
- `alphavantage_api_call_duration_seconds` - API call duration
- `alphavantage_worker_running` - Worker running status
- `alphavantage_worker_paused` - Worker paused status

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ConnectionStrings__DefaultConnection` | PostgreSQL connection string | Required |
| `AlphaVantage__ApiKey` | Alpha Vantage API key | Required |
| `AlphaVantage__BaseUrl` | Alpha Vantage API base URL | `https://www.alphavantage.co` |
| `AlphaVantage__FetchIntervalMinutes` | Interval between fetch cycles | `60` |
| `AlphaVantage__Symbols` | Comma-separated stock symbols | `AAPL,GOOGL,MSFT,AMZN,TSLA` |
| `MetricsService__BaseUrl` | URL of the Metrics Service | `http://metrics-service:8080` |
| `MetricsService__WorkerName` | Name for metrics labeling | `alphavantage` |
| `MetricsService__Enabled` | Enable/disable metrics | `true` |

### appsettings.json

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres"
  },
  "AlphaVantage": {
    "ApiKey": "your-api-key",
    "BaseUrl": "https://www.alphavantage.co",
    "FetchIntervalMinutes": 60,
    "Symbols": ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
  },
  "MetricsService": {
    "BaseUrl": "http://localhost:8082",
    "WorkerName": "alphavantage",
    "Enabled": true
  }
}
```

## Project Structure

```
AlphaVantage/
├── AlphaVantage.sln           # Solution file
├── Dockerfile                  # Docker build configuration
├── README.md                   # This file
└── src/
    └── AlphaVantage.Worker/
        ├── Configuration/      # Settings classes
        ├── Controllers/        # REST API controllers
        ├── Models/             # Data models and API responses
        ├── Repositories/       # Database access layer
        ├── Services/           # API client and business logic
        ├── Workers/            # Background service worker
        ├── Program.cs          # Application entry point
        └── appsettings.json    # Configuration file
```

## Dependencies

This service depends on:
- **StockTracker.Common**: Shared library for metrics client and worker state
- **Metrics Service**: Central metrics aggregation (must be running for metrics)
- **PostgreSQL**: Database for storing fetched data

## Development

### Prerequisites

- .NET 8 SDK
- PostgreSQL database (or use Docker Compose)
- Metrics Service running (or disable metrics in config)
- Alpha Vantage API key (free at https://www.alphavantage.co/support/#api-key)

### Running Locally

1. Start dependencies:
   ```bash
   docker-compose up postgres metrics-service -d
   ```

2. Configure your API key:
   ```bash
   cd services/data-fetchers/AlphaVantage
   # Edit src/AlphaVantage.Worker/appsettings.json with your API key
   ```

3. Run the service:
   ```bash
   dotnet run --project src/AlphaVantage.Worker
   ```

4. Access the API:
   - Swagger UI: http://localhost:5000/swagger
   - Health check: http://localhost:5000/health

### Running with Docker

```bash
# From project root
docker-compose up alpha-vantage-fetcher

# Access the API at http://localhost:8081
```

### Running Tests

```bash
dotnet test
```

## API Rate Limits

Alpha Vantage free tier limitations:
- 5 API calls per minute
- 500 API calls per day

The service includes a 15-second delay between symbol fetches to stay within rate limits.

## Database Tables Used

- `stocks` - Master list of tracked stocks
- `stock_prices` - Historical and current price data
- `data_sources` - Registered data source (AlphaVantage)
- `fetch_logs` - Operation audit trail

## Troubleshooting

### Common Issues

1. **"Data source 'AlphaVantage' not found"**
   - Ensure the database init script ran successfully
   - Check if the `data_sources` table contains the AlphaVantage entry

2. **API rate limit exceeded**
   - Increase `FetchIntervalMinutes`
   - Reduce the number of symbols
   - Consider upgrading to a paid Alpha Vantage plan

3. **Connection refused to database**
   - Ensure PostgreSQL is running
   - Check the connection string
   - Verify network connectivity (especially in Docker)

4. **Health check failing**
   - Check `/health` endpoint for detailed status
   - Verify database connectivity
   - Check worker status via `/api/fetch/status`

5. **Metrics not appearing**
   - Ensure Metrics Service is running
   - Check `MetricsService__Enabled` is `true`
   - Verify `MetricsService__BaseUrl` is correct

## License

MIT License
