# StockTracker Metrics Service

Central metrics aggregation microservice for all Stock and Crypto Tracker workers.

## Overview

This service acts as a central collection point for metrics from all workers. Workers push metrics to this service via HTTP, and Prometheus scrapes the aggregated metrics from the `/metrics` endpoint.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  AlphaVantage   │     │  Other Workers  │
│     Worker      │     │                 │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │  POST /api/metrics    │
         └───────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │   Metrics Service      │
        │                        │
        │  - Receives metrics    │
        │  - Aggregates data     │
        │  - Exposes /metrics    │
        └───────────┬────────────┘
                    │
                    ▼ GET /metrics
        ┌────────────────────────┐
        │      Prometheus        │
        └────────────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info |
| POST | `/api/metrics` | Record a single metric |
| POST | `/api/metrics/batch` | Record multiple metrics |
| GET | `/api/metrics/workers` | List registered workers and status |
| GET | `/metrics` | Prometheus scrape endpoint |
| GET | `/health` | Health check |
| GET | `/swagger` | API documentation |

## Recording Metrics

### Single Metric

```bash
curl -X POST http://localhost:8082/api/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "workerName": "alphavantage",
    "type": "Counter",
    "name": "fetch_operations_total",
    "value": 1,
    "labels": {
      "symbol": "AAPL",
      "status": "success"
    }
  }'
```

### Batch Metrics

```bash
curl -X POST http://localhost:8082/api/metrics/batch \
  -H "Content-Type: application/json" \
  -d '{
    "workerName": "alphavantage",
    "metrics": [
      {
        "type": "Counter",
        "name": "fetch_operations_total",
        "value": 1,
        "labels": { "status": "success" }
      },
      {
        "type": "Histogram",
        "name": "fetch_duration_seconds",
        "value": 2.5,
        "labels": { "symbol": "AAPL" }
      }
    ]
  }'
```

## Metric Types

| Type | Description | Example |
|------|-------------|---------|
| `Counter` | Monotonically increasing value | Operations count, errors |
| `Gauge` | Value that can go up or down | Current connections, worker status |
| `Histogram` | Distribution of values | Request duration, response size |

## Metric Naming

Metrics are automatically prefixed with the worker name:
- Input: `workerName: "alphavantage"`, `name: "fetch_operations_total"`
- Output: `alphavantage_fetch_operations_total`

## Running Locally

```bash
cd services/metrics/StockTracker.Metrics
dotnet run
```

Access:
- Service: http://localhost:5000
- Swagger: http://localhost:5000/swagger
- Metrics: http://localhost:5000/metrics

## Running with Docker

```bash
# From project root
docker-compose up metrics-service
```

Access: http://localhost:8082

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ASPNETCORE_URLS` | Listen URLs | `http://+:8080` |
| `ASPNETCORE_ENVIRONMENT` | Environment | `Production` |

## Worker Integration

Workers should use the `StockTracker.Common` library which provides `IMetricsClient` to push metrics to this service. See the common library documentation for integration details.




