# Worker Endpoints

Quick reference for all worker/service endpoints accessible via Caddy reverse proxy.

**Base URL**: `https://nxserver.malaysiawest.cloudapp.azure.com`

## Active Services (Phase 1)

| Service | Path | Purpose |
|---------|------|---------|
| **n8n** | `/` | Workflow automation dashboard |
| **TwelveData Swagger** | `/api/twelvedata/swagger` | API documentation & testing |
| **TwelveData Health** | `/api/twelvedata/health/live` | Health check |

## Disabled Services (Phase 2)

| Service | Path | Status |
|---------|------|--------|
| **Metrics Swagger** | `/api/metrics/swagger` | ⏸️ Disabled |
| **AI-Hub Docs** | `/api/ai-hub/docs` | ⏸️ Needs API keys |

## Full URLs

```
# n8n Dashboard
https://nxserver.malaysiawest.cloudapp.azure.com/

# TwelveData Worker
https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger
https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live

# Metrics Service (Phase 2)
https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger

# AI Hub (Phase 2)
https://nxserver.malaysiawest.cloudapp.azure.com/api/ai-hub/docs
```

## TwelveData API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/twelvedata/health/live` | GET | Liveness check |
| `/api/twelvedata/health/ready` | GET | Readiness check |
| `/api/twelvedata/api/fetch/trigger/all` | POST | Trigger manual fetch |
| `/api/twelvedata/api/fetch/status` | GET | Get fetch status |

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
