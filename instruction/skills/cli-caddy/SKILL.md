---
name: cli-caddy
description: Caddy reverse proxy configuration and worker endpoint reference. Use when checking service URLs, adding new routes, or debugging proxy issues.
triggers:
  - "caddy endpoints"
  - "worker urls"
  - "service endpoints"
  - "add caddy route"
  - "reverse proxy"
---

# Caddy CLI Skill

## Overview

Caddy reverse proxy configuration and all worker/service endpoints for the Stock Tracker platform.

---

## Base URL

```
https://nxserver.malaysiawest.cloudapp.azure.com
```

---

## Active Service Endpoints

| Service | Path | Purpose |
|---------|------|---------|
| **n8n** | `/` | Workflow automation dashboard |
| **Back-Office** | `/back-office` | Admin UI (data-fetchers, CLI testing) |
| **TwelveData Swagger** | `/api/twelvedata/swagger` | API documentation & testing |
| **TwelveData Health** | `/api/twelvedata/health/live` | Health check |
| **Metrics Swagger** | `/api/metrics/swagger` | Metrics API documentation |
| **Metrics Health** | `/api/metrics/health/live` | Health check |

---

## Internal Services (Not Publicly Accessible)

| Service | Internal URL | Purpose |
|---------|--------------|---------|
| **AI-Hub** | `http://host.docker.internal:8084` | AI Gateway (Docker containers) |
| **AI-Hub** | `http://localhost:8084` | AI Gateway (from VM via SSH) |

---

## TwelveData API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/twelvedata/health/live` | GET | Liveness check |
| `/api/twelvedata/health/ready` | GET | Readiness check |
| `/api/twelvedata/api/fetch/trigger/{symbol}` | POST | Fetch single symbol |
| `/api/twelvedata/api/fetch/trigger/all` | POST | Fetch all active tickers |
| `/api/twelvedata/api/fetch/status` | GET | Get fetch status |

---

## Metrics API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics/health/live` | GET | Liveness check |
| `/api/metrics/api/metrics` | POST | Record single metric |
| `/api/metrics/api/metrics/batch` | POST | Record batch metrics |
| `/api/metrics/metrics` | GET | Prometheus scrape endpoint |

---

## AI Hub API Endpoints (Internal Only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness check |
| `/api/chat` | POST | Main AI interaction endpoint |
| `/api/models` | GET | List registered CLI models |
| `/docs` | GET | FastAPI Swagger documentation |

---

## Caddy Admin API (SSH only)

```bash
# SSH to VM first
ssh-azure

# View Caddy config
curl localhost:2019/config/ | jq

# View loaded certificates
curl localhost:2019/pki/ca/local | jq
```

---

## Adding New Routes

Edit `deployment/vm/Caddyfile`:

```
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

Then reload Caddy:
```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Related

- [vm-operations](../../rules/vm-operations.md) - VM access commands
- [data-fetcher](../data-fetcher/SKILL.md) - Adding new workers



