# Worker Endpoints

Quick reference for all worker/service endpoints accessible via Caddy reverse proxy.

**Base URL**: `https://nxserver.malaysiawest.cloudapp.azure.com`

## Active Services

| Service | Path | Purpose |
|---------|------|---------|
| **n8n** | `/` | Workflow automation dashboard |
| **Back-Office** | `/back-office` | Admin UI (data-fetchers, CLI testing) |
| **TwelveData Swagger** | `/api/twelvedata/swagger` | API documentation & testing |
| **TwelveData Health** | `/api/twelvedata/health/live` | Health check |
| **Metrics Swagger** | `/api/metrics/swagger` | Metrics API documentation |
| **Metrics Health** | `/api/metrics/health/live` | Health check |

## Internal Services (Not Publicly Accessible)

| Service | Internal URL | Purpose |
|---------|--------------|---------|
| **AI-Hub** | `http://host.docker.internal:8084` | AI Gateway (Docker containers only) |
| **AI-Hub** | `http://localhost:8084` | AI Gateway (from VM via SSH) |

## Monitoring (Grafana Cloud)

| Service | Access | Purpose |
|---------|--------|---------|
| **Grafana Alloy** | Internal only | Scrapes metrics, forwards to Grafana Cloud |
| **Grafana Cloud** | [grafana.com](https://grafana.com) | Dashboards, alerting, monitoring |

## Full URLs

```
# n8n Dashboard
https://nxserver.malaysiawest.cloudapp.azure.com/

# Back-Office - AI Hub Test UI
https://nxserver.malaysiawest.cloudapp.azure.com/back-office

# TwelveData Worker
https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger
https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live

# Metrics Service
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/metrics  # Prometheus format

# AI Hub - INTERNAL ONLY (not publicly accessible)
# Access from Docker containers: http://host.docker.internal:8084
# Access from VM (SSH): curl http://localhost:8084/health
```

## TwelveData API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/twelvedata/health/live` | GET | Liveness check |
| `/api/twelvedata/health/ready` | GET | Readiness check |
| `/api/twelvedata/api/fetch/trigger/{symbol}` | POST | Fetch single symbol (optional `?date=YYYY-MM-DD`) |
| `/api/twelvedata/api/fetch/trigger/all` | POST | Fetch all active tickers |
| `/api/twelvedata/api/fetch/status` | GET | Get fetch status |

## Metrics API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics/health/live` | GET | Liveness check |
| `/api/metrics/api/metrics` | POST | Record single metric |
| `/api/metrics/api/metrics/batch` | POST | Record batch metrics |
| `/api/metrics/api/metrics/workers` | GET | List registered workers |
| `/api/metrics/metrics` | GET | Prometheus scrape endpoint |

## AI Hub API Endpoints (Internal Only)

Access via `http://host.docker.internal:8084` from Docker containers or `http://localhost:8084` from VM.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness check |
| `/api/chat` | POST | Main AI interaction endpoint |
| `/api/models` | GET | List registered CLI models |
| `/cli/stock-tracker/claude/opus-4.5` | POST | Claude CLI endpoint |
| `/docs` | GET | FastAPI Swagger documentation |

## Manual Testing via Swagger

1. Open: https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger
2. Expand endpoint
3. Click "Try it out"
4. Execute and view response

## Caddy Admin API (SSH only)

```bash
# SSH to VM first
ssh-azure

# View Caddy config
curl localhost:2019/config/ | jq

# View loaded certificates
curl localhost:2019/pki/ca/local | jq
```

## Alloy Status (SSH only)

```bash
# Check Alloy is running
docker ps --filter name=alloy

# View Alloy logs
docker logs alloy --tail 50

# Check if metrics are being scraped
docker logs alloy 2>&1 | grep -i "scrape"
```
