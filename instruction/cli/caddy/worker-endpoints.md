# Worker Endpoints

Quick reference for all worker/service endpoints accessible via Caddy reverse proxy.

**Base URL**: `https://nxserver.malaysiawest.cloudapp.azure.com`

## Active Services

| Service | Path | Purpose |
|---------|------|---------|
| **n8n** | `/` | Workflow automation dashboard |
| **TwelveData Swagger** | `/api/twelvedata/swagger` | API documentation & testing |
| **TwelveData Health** | `/api/twelvedata/health/live` | Health check |
| **Metrics Swagger** | `/api/metrics/swagger` | Metrics API documentation |
| **Metrics Health** | `/api/metrics/health/live` | Health check |

## Monitoring (Grafana Cloud)

| Service | Access | Purpose |
|---------|--------|---------|
| **Grafana Alloy** | Internal only | Scrapes metrics, forwards to Grafana Cloud |
| **Grafana Cloud** | [grafana.com](https://grafana.com) | Dashboards, alerting, monitoring |

## Disabled Services

| Service | Path | Status |
|---------|------|--------|
| **AI-Hub Docs** | `/api/ai-hub/docs` | Needs API keys |

## Full URLs

```
# n8n Dashboard
https://nxserver.malaysiawest.cloudapp.azure.com/

# TwelveData Worker
https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger
https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live

# Metrics Service
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/metrics  # Prometheus format

# AI Hub (disabled)
https://nxserver.malaysiawest.cloudapp.azure.com/api/ai-hub/docs
```

## TwelveData API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/twelvedata/health/live` | GET | Liveness check |
| `/api/twelvedata/health/ready` | GET | Readiness check |
| `/api/twelvedata/api/fetch/trigger/all` | POST | Trigger manual fetch |
| `/api/twelvedata/api/fetch/status` | GET | Get fetch status |

## Metrics API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics/health/live` | GET | Liveness check |
| `/api/metrics/api/metrics` | POST | Record single metric |
| `/api/metrics/api/metrics/batch` | POST | Record batch metrics |
| `/api/metrics/api/metrics/workers` | GET | List registered workers |
| `/api/metrics/metrics` | GET | Prometheus scrape endpoint |

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
