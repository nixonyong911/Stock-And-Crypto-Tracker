# Stock and Crypto Tracker

A microservices-based application for tracking stocks and cryptocurrency prices from multiple data sources.

## Primary Goal

Track stocks and cryptocurrency prices by aggregating data from multiple third-party APIs. The system is designed with loose coupling, allowing data sources to be easily added or removed without affecting other components.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Data Fetching Layer (.NET 8)                      │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ AlphaVantage │  │  [Service B] │  │  [Service C] │   ...        │   │
│  │  │   Fetcher    │  │   Fetcher    │  │   Fetcher    │              │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │   │
│  │         │                 │                 │                       │   │
│  └─────────┼─────────────────┼─────────────────┼───────────────────────┘   │
│            │                 │                 │                            │
│            │    WRITE        │    WRITE        │    WRITE                   │
│            ▼                 ▼                 ▼                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        PostgreSQL Database                           │   │
│  │                                                                      │   │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │    │stock_prices │  │crypto_prices│  │data_sources │               │   │
│  │    └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ▲                                        │
│                                    │ READ                                   │
│                                    │                                        │
│  ┌─────────────────────────────────┴───────────────────────────────────┐   │
│  │                     Frontend (Next.js 16)                            │   │
│  │                                                                      │   │
│  │         Server Components with Direct Database Access                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Microservices

### 1. Data Fetching Layer (.NET 8)
- **Purpose**: Fetch data from third-party APIs and store it in the database
- **Technology**: .NET 8 Worker Services with BackgroundService
- **Design**: Each API provider has its own independent service
- **Communication**: Services only write to the shared database (no inter-service communication)

### 2. Frontend Service (Next.js 16)
- **Purpose**: Display stock and cryptocurrency data to users
- **Technology**: Next.js 16 with App Router and Server Components
- **Data Access**: Direct database queries via server components (read-only)

### 3. PostgreSQL Database
- **Purpose**: Central data store for all services
- **Access Pattern**: Data fetchers write, frontend reads

## Project Structure

```
StockAndCryptoTracker/
├── README.md                          # This file
├── docker-compose.yml                 # Container orchestration
├── .env.example                       # Environment variables template
├── services/
│   ├── data-fetchers/
│   │   ├── AlphaVantage/             # Stock data fetcher
│   │   │   ├── AlphaVantage.sln
│   │   │   ├── src/
│   │   │   │   └── AlphaVantage.Worker/
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
docker-compose logs -f alpha-vantage-fetcher
docker-compose logs -f frontend
```

## Adding a New Data Fetcher Service

The architecture is designed to easily add new data sources. Follow these steps:

### 1. Create the Service Directory
```bash
mkdir -p services/data-fetchers/NewService/src/NewService.Worker
```

### 2. Create a .NET Worker Service
Use the AlphaVantage service as a template:
- Copy the project structure from `services/data-fetchers/AlphaVantage/`
- Rename namespaces and project files
- Implement your API client in the `Services/` folder
- Configure the scheduler in `Workers/`

### 3. Create the Dockerfile
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

### 4. Add to docker-compose.yml
```yaml
new-service-fetcher:
  build:
    context: ./services/data-fetchers/NewService
    dockerfile: Dockerfile
  environment:
    - ConnectionStrings__DefaultConnection=${DATABASE_URL}
    - NewService__ApiKey=${NEW_SERVICE_API_KEY}
    - NewService__FetchIntervalMinutes=15
  depends_on:
    postgres:
      condition: service_healthy
  restart: unless-stopped
```

### 5. Add Environment Variables
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

## Development

### Local Development Setup

#### Data Fetcher Services (.NET)
```bash
cd services/data-fetchers/AlphaVantage
dotnet restore
dotnet run --project src/AlphaVantage.Worker
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
cd services/data-fetchers/AlphaVantage
dotnet test

# Frontend
cd services/frontend
npm test
```

## Environment Variables

See `.env.example` for all required environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_USER` | Database username | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `POSTGRES_DB` | Database name | Yes |
| `DATABASE_URL` | Full connection string | Yes |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key | Yes |

## Technology Stack

- **Data Fetchers**: .NET 8, Worker Services, Npgsql
- **Frontend**: Next.js 16, React 19, Server Components
- **Database**: PostgreSQL 16
- **Containerization**: Docker, Docker Compose

## License

MIT License

