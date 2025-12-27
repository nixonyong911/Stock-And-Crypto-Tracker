# Stock and Crypto Tracker

A microservices-based application for tracking stocks and cryptocurrency prices from multiple data sources.

## Primary Goal

Track stocks and cryptocurrency prices by aggregating data from multiple third-party APIs. The system is designed with loose coupling, allowing data sources to be easily added or removed without affecting other components.

## Architecture Principles

> **Key Principle**: Features not directly related to a worker's core responsibility should be standalone microservices. This ensures loose coupling and maintainability.
>
> Examples:
> - Metrics collection → `StockTracker.Metrics` service
> - (Future) Notifications → `StockTracker.Notifications` service
> - (Future) Scheduling → `StockTracker.Scheduler` service

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                    Data Fetching Layer (.NET 8)                             │ │
│  │                                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │ │
│  │  │  TwelveData  │  │  [Service B] │  │  [Service C] │   ...               │ │
│  │  │   Fetcher    │  │   Fetcher    │  │   Fetcher    │                     │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                     │ │
│  │         │                 │                 │                              │ │
│  └─────────┼─────────────────┼─────────────────┼──────────────────────────────┘ │
│            │                 │                 │                                 │
│            │ WRITE           │ WRITE           │ WRITE                          │
│            ▼                 ▼                 ▼                                 │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                        PostgreSQL Database                                  │ │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │ │
│  │    │stock_prices │  │crypto_prices│  │data_sources │                      │ │
│  │    └─────────────┘  └─────────────┘  └─────────────┘                      │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                             │
│            ┌───────────────────────┴──────────────────────────┐                 │
│            │                       │ READ                      │                 │
│            │                       │                           │                 │
│  ┌─────────┴─────────┐   ┌─────────┴──────────────────────────┴───────────────┐ │
│  │  Metrics Service  │   │                  Frontend (Next.js)                 │ │
│  │                   │   │         Server Components with Direct DB Access     │ │
│  │  POST /metrics ◄──┼───┤                                                     │ │
│  │  GET /metrics ────┼───┼──► Prometheus                                       │ │
│  └───────────────────┘   └─────────────────────────────────────────────────────┘ │
│            ▲                                                                     │
│            │ Push Metrics                                                        │
│  ┌─────────┴──────────────────────────────────────────────────────────────────┐ │
│  │                         All Workers Push Here                               │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Microservices

### 1. Data Fetching Layer (.NET 8)
- **Purpose**: Fetch data from third-party APIs and store it in the database
- **Technology**: .NET 8 ASP.NET Core with BackgroundService
- **Design**: Each API provider has its own independent service
- **Communication**: Services write to the shared database and push metrics to the Metrics Service

### 2. Metrics Service (.NET 8)
- **Purpose**: Central aggregation of metrics from all workers
- **Technology**: .NET 8 ASP.NET Core with prometheus-net
- **Design**: Workers push metrics via HTTP, Prometheus scrapes from this single endpoint
- **Location**: `services/metrics/`

### 3. Common Library (.NET 8)
- **Purpose**: Shared code for all workers (metrics client, worker state, health checks)
- **Technology**: .NET 8 Class Library
- **Location**: `services/common/`

### 4. Frontend Service (Next.js)
- **Purpose**: Display stock and cryptocurrency data to users
- **Technology**: Next.js with App Router and Server Components
- **Data Access**: Direct database queries via server components (read-only)

### 5. PostgreSQL Database
- **Purpose**: Central data store for all services
- **Access Pattern**: Data fetchers write, frontend reads

## Project Structure

```
StockAndCryptoTracker/
├── README.md                          # This file
├── docker-compose.yml                 # Container orchestration
├── .env.example                       # Environment variables template
├── monitoring/
│   └── prometheus.yml                 # Prometheus configuration
├── services/
│   ├── common/                        # Shared library
│   │   └── StockTracker.Common/
│   │       ├── Metrics/               # IMetricsClient
│   │       └── Services/              # WorkerStateService, HealthChecks
│   ├── metrics/                       # Central metrics service
│   │   └── StockTracker.Metrics/
│   │       ├── Controllers/
│   │       ├── Services/
│   │       └── Dockerfile
│   ├── data-fetchers/
│   │   ├── TwelveData/               # Stock data fetcher (10-min candles)
│   │   │   ├── src/
│   │   │   │   └── TwelveData.Worker/
│   │   │   ├── Dockerfile
│   │   │   └── README.md
│   │   └── [Future: CoinGecko/, Finnhub/, etc.]
│   └── frontend/
│       ├── src/
│       ├── Dockerfile
│       └── README.md
└── database/
    ├── init/
    │   └── 01-init.sql               # Database schema
    └── README.md
```

## Getting Started

### Prerequisites
- Docker and Docker Compose
- (Optional for local development):
  - .NET 8 SDK
  - Node.js 20+
  - PostgreSQL client

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd StockAndCryptoTracker
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - TwelveData API: http://localhost:8083/swagger
   - Metrics Service: http://localhost:8082/swagger
   - Database: localhost:5432

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f twelvedata-fetcher
docker-compose logs -f metrics-service
docker-compose logs -f frontend
```

## Adding a New Data Fetcher Service

The architecture is designed to easily add new data sources. Follow these steps:

### 1. Create the Service Directory
```bash
mkdir -p services/data-fetchers/NewService/src/NewService.Worker
```

### 2. Create a .NET Worker Service
Use the TwelveData service as a template:
- Copy the project structure from `services/data-fetchers/TwelveData/`
- Rename namespaces and project files
- Add reference to `StockTracker.Common`
- Implement your API client in the `Services/` folder
- Configure the scheduler in `Workers/`

### 3. Add Metrics Integration
```csharp
// In Program.cs
builder.Services.AddMetricsClient(builder.Configuration);
builder.Services.AddWorkerState();

// In appsettings.json
{
  "MetricsService": {
    "BaseUrl": "http://metrics-service:8080",
    "WorkerName": "newservice",
    "Enabled": true
  }
}
```

### 4. Create the Dockerfile
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/NewService.Worker/NewService.Worker.csproj", "NewService.Worker/"]
RUN dotnet restore "NewService.Worker/NewService.Worker.csproj"
COPY src/ .
WORKDIR "/src/NewService.Worker"
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "NewService.Worker.dll"]
```

### 5. Add to docker-compose.yml
```yaml
new-service-fetcher:
  build:
    context: ./services/data-fetchers/NewService
    dockerfile: Dockerfile
  environment:
    - ConnectionStrings__DefaultConnection=Host=postgres;...
    - NewService__ApiKey=${NEW_SERVICE_API_KEY}
    - MetricsService__BaseUrl=http://metrics-service:8080
    - MetricsService__WorkerName=newservice
  depends_on:
    postgres:
      condition: service_healthy
    metrics-service:
      condition: service_healthy
  restart: unless-stopped
```

### 6. Add Environment Variables
Update `.env.example` and your local `.env`:
```
NEW_SERVICE_API_KEY=your-api-key-here
```

## Removing a Data Fetcher Service

### Option 1: Temporary Disable
Comment out the service in `docker-compose.yml`:
```yaml
# new-service-fetcher:
#   build: ...
```

### Option 2: Permanent Removal
1. Remove or comment the service from `docker-compose.yml`
2. Optionally delete the service directory
3. Clean up related environment variables

**Note**: Existing data in the database will be preserved. To remove data, run appropriate SQL cleanup.

## Monitoring with Prometheus & Grafana

1. Uncomment Prometheus and Grafana in `docker-compose.yml`

2. Start the monitoring stack:
   ```bash
   docker-compose up prometheus grafana -d
   ```

3. Access:
   - Prometheus: http://localhost:9090
   - Grafana: http://localhost:3001 (admin/admin)

4. All worker metrics are aggregated at the Metrics Service (`/metrics` endpoint)

## Development

### Local Development Setup

#### Data Fetcher Services (.NET)
```bash
cd services/data-fetchers/TwelveData
dotnet restore
dotnet run --project src/TwelveData.Worker
```

#### Metrics Service (.NET)
```bash
cd services/metrics/StockTracker.Metrics
dotnet restore
dotnet run
```

#### Frontend (Next.js)
```bash
cd services/frontend
npm install
npm run dev
```

#### Database Only
```bash
docker-compose up postgres -d
```

### Running Tests
```bash
# .NET services
cd services/data-fetchers/TwelveData
dotnet test

# Frontend
cd services/frontend
npm test
```

## Environment Variables

See `.env.example` for all required environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_CONNECTION_STRING` | Supabase PostgreSQL connection | Yes |
| `TWELVE_DATA_API_KEY` | TwelveData API key | Yes |
| `METRICS_SERVICE_PORT` | Metrics service port | No (default: 8082) |
| `TWELVEDATA_API_PORT` | TwelveData API port | No (default: 8083) |

## Technology Stack

- **Data Fetchers**: .NET 8, ASP.NET Core, Worker Services, Npgsql
- **Metrics Service**: .NET 8, ASP.NET Core, prometheus-net
- **Common Library**: .NET 8 Class Library
- **Frontend**: Next.js, React, Server Components
- **Database**: PostgreSQL 16
- **Monitoring**: Prometheus, Grafana
- **Containerization**: Docker, Docker Compose

## License

MIT License
