# Workers

This directory contains all worker microservices for the Stock and Crypto Tracker application.

## Directory Structure

```
services/workers/
├── README.md                    # This file
├── data-fetcher/                # Data fetching workers
│   └── TwelveData/             # Stock market data fetcher
└── analysis/                    # Analysis workers
    └── CandlestickAnalysis/    # Candlestick pattern analyzer
```

## Worker Types

| Type | Location | Purpose |
|------|----------|---------|
| `data-fetcher` | `services/workers/data-fetcher/{name}/` | Fetches external API data |
| `analysis` | `services/workers/analysis/{name}/` | Processes existing data |

## Architecture

Each worker is an independent .NET 8 ASP.NET Core service that:
- Runs on a configurable schedule using `BackgroundService`
- Stores data in the shared PostgreSQL database
- Pushes metrics to the central Metrics Service
- Exposes REST API for control (trigger, pause, resume)
- Operates independently (can be added/removed without affecting other services)
- Uses shared components from `StockTracker.Common`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Worker Pattern                                 │
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

## Current Workers

### Data Fetchers

| Worker | Description | Status |
|--------|-------------|--------|
| [TwelveData](data-fetcher/TwelveData/) | Stock market data (15-min candles) | Active |

### Analysis Workers

| Worker | Description | Status |
|--------|-------------|--------|
| [CandlestickAnalysis](analysis/CandlestickAnalysis/) | Daily candlestick pattern detection | Active |

## Creating a New Worker

See: [Worker Requirements Skill](../../instruction/skills/worker-requirements/SKILL.md)

### Quick Start

1. **Create directory structure:**
   ```bash
   # For data-fetcher
   mkdir -p services/workers/data-fetcher/NewService/src/NewService.Worker/{Configuration,Controllers,Models,Repositories,Services,Workers}
   
   # For analysis
   mkdir -p services/workers/analysis/NewService/src/NewService.Worker/{Configuration,Controllers,Models,Repositories,Services,Workers}
   ```

2. **Copy template from existing worker**

3. **Update paths in:**
   - Dockerfile (COPY paths)
   - `.github/workflows/deploy-vm.yml` (trigger paths)
   - `deployment/vm/docker-compose.yml` (build paths)

4. **Register in database:**
   - Add to `data_sources` table
   - Add to `worker_fetch_schedules` table with `worker_id` reference

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

## Monitoring

### Via Metrics Service
All worker metrics are aggregated at the central Metrics Service:
- http://localhost:8082/metrics (Prometheus format)
- http://localhost:8082/api/metrics/workers (worker status)

### Via Worker API
Each worker exposes control endpoints:
- `GET /api/{worker}/status` - Worker status
- `POST /api/{worker}/trigger/{id}` - Manual trigger (single)
- `POST /api/{worker}/trigger/all` - Manual trigger (batch)

### Via Grafana
- Worker Overview dashboard
- Worker-specific detail dashboards

## Related Documentation

- [Worker Requirements Skill](../../instruction/skills/worker-requirements/SKILL.md)
- [Metrics Architecture](../../instruction/architecture/metrics-architecture.md)
- [CI/CD Deployment](../../instruction/rules/cicd-deployment.md)
