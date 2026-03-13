# VM Deployment Architecture

**Last Updated**: January 11, 2026

## Overview

All backend services run on a single Azure VM using Docker Compose, with Caddy as the reverse proxy providing automatic HTTPS. Gateway 2.0 (TypeScript AI gateway) runs as a Docker container with volume mounts to access CLIs installed on the host.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐    ┌──────────────┐                      ┌─────────────┐     │
│   │   FRONTEND   │    │  BACK-OFFICE │                      │  DATABASE   │     │
│   │   (Vercel)   │    │    (VM)      │                      │ (Supabase)  │     │
│   ├──────────────┤    ├──────────────┤                      ├─────────────┤     │
│   │  Next.js 15  │    │  Next.js 16  │                      │ PostgreSQL  │     │
│   │   Public     │    │  Admin UI    │                      │             │     │
│   └──────┬───────┘    └──────┬───────┘                      └──────▲──────┘     │
│          │                   │                                     │            │
│          │ Supabase Client   │ /back-office             All services│            │
│          │                   │                                     │            │
│          ▼                   ▼                                     │            │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                     AZURE VM (nx-linux-server-azure)                      │  │
│   │                     20.17.176.1 / Standard_B2s / Ubuntu 24.04            │  │
│   ├──────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                           │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │   │                    CADDY (Reverse Proxy)                         │    │  │
│   │   │                    Auto HTTPS via Let's Encrypt                  │    │  │
│   │   │   :443 ──────────────────────────────────────────────────────    │    │  │
│   │   │      │                                                           │    │  │
│   │   │      ├── /                    → n8n:5678                         │    │  │
│   │   │      ├── /api/data-fetcher-2.0/* → data-fetcher-2.0:8080        │    │  │
│   │   │      ├── /api/fred/*          → data-fetcher-2.0:8080          │    │  │
│   │   │      ├── /api/metrics/*       → metrics:8080                     │    │  │
│   │   │      └── /back-office*        → back-office:3000                 │    │  │
│   │   │                                                                  │    │  │
│   │   │      NOTE: Gateway 2.0 NOT exposed (internal Docker network only) │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                                         │                                 │  │
│   │   ┌─────────────────────────────────────┼───────────────────────────┐    │  │
│   │   │              DOCKER CONTAINERS      │                           │    │  │
│   │   ├──────────────┬──────────────────┬──────┴──┬──────────────┬─────┤    │  │
│   │   │     n8n      │ DataFetcher 2.0 │ Metrics │  Back-office │Alloy│    │  │
│   │   │   :5678      │     :8080       │  :8080  │    :3000     │     │    │  │
│   │   │  Workflows   │  Market Data    │  Agg    │   Admin UI   │Logs │    │  │
│   │   ├──────────────┴──────────────┴──────────────┴──────────────┴─────┤    │  │
│   │   │                   Gateway 2.0 (TypeScript)                    │    │  │
│   │   │                     gateway-2.0:8080                           │    │  │
│   │   │              Claude + Cursor-agent CLI + Telegram bot           │    │  │
│   │   │              (CLIs mounted via Docker volumes)                  │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                                                                           │  │
│   └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                        GRAFANA CLOUD (Observability)                     │   │
│   │   Alloy forwards metrics (Prometheus) and logs (Loki) to Grafana Cloud   │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD PIPELINE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────────┐  │
│   │   Developer  │      │    GitHub    │      │          Azure VM            │  │
│   │              │      │   Actions    │      │                              │  │
│   │  git push    │─────▶│              │──SSH─▶│  1. git pull                 │  │
│   │              │      │  Build on    │      │  2. docker load (pre-built)  │  │
│   │              │      │  GHA runners │      │  3. docker compose up -d     │  │
│   │              │      │  (parallel)  │      │  4. Health checks            │  │
│   │              │      │              │      │                              │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────────┘  │
│                                                                                  │
│   Trigger Paths:                                                                 │
│   - services/workers/data-fetcher-2.0/**                                         │
│   - services/metrics/**                                                          │
│   - services/ai/gateway-2.0/**                                                   │
│   - services/back-office/**                                                      │
│   - services/common/**                                                           │
│   - deployment/vm/**                                                             │
│   - .github/workflows/deploy-vm.yml                                              │
│                                                                                  │
│   Excluded (deployed via Vercel):                                                │
│   - services/frontend/**                                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Secrets Management

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SECRETS FLOW                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Infisical Cloud (Source of Truth)                                              │
│         │                                                                        │
│         ├──► GitHub Secrets (auto-sync)                                          │
│         │         │                                                              │
│         │         └──► GitHub Actions ──► SSH ──► VM                             │
│         │                                          │                             │
│         │                        start-services.sh uses Infisical CLI            │
│         │                        (Machine Identity auth)                         │
│         │                                                                        │
│         └──► Vercel (auto-sync for frontend NEXT_PUBLIC_* vars)                  │
│                                                                                  │
│   Secrets Inventory:                                                             │
│   ┌────────────────────────────────────┬───────────────────────────────────┐    │
│   │ Secret                             │ Used By                           │    │
│   ├────────────────────────────────────┼───────────────────────────────────┤    │
│   │ DATABASE_CONNECTION_STRING         │ Data Fetcher 2.0, Gateway 2.0     │    │
│   │ AI_HUB_API_KEY                     │ gateway-2.0, n8n, Data Fetcher 2.0, Metrics, Back-office │
│   │ GRAFANA_CLOUD_API_KEY              │ Alloy (metrics forwarder)         │    │
│   │ GRAFANA_CLOUD_LOKI_USER            │ Alloy (logs forwarder)            │    │
│   │ NEXT_PUBLIC_SUPABASE_URL           │ Frontend, Back-office             │    │
│   │ NEXT_PUBLIC_SUPABASE_PUBLISHABLE.. │ Frontend, Back-office             │    │
│   │ VM_SSH_PRIVATE_KEY                 │ GitHub Actions                    │    │
│   │ PAT_GITHUB                         │ Clone private repo (if needed)    │    │
│   └────────────────────────────────────┴───────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## VM Details

| Property | Value |
|----------|-------|
| **Name** | nx-linux-server-azure |
| **Resource Group** | NIXON-CITY |
| **Size** | Standard_B2s (2 vCPU, 4GB RAM) |
| **Location** | Malaysia West |
| **Public IP** | 20.17.176.1 |
| **DNS** | nxserver.malaysiawest.cloudapp.azure.com |
| **OS** | Ubuntu 24.04.3 LTS |
| **Docker** | Docker Compose v2 |

## Services

### Docker Containers

| Service | Port | Caddy Route | Description |
|---------|------|-------------|-------------|
| Caddy | 80, 443, 2019 | — | Reverse proxy (2019 = admin API) |
| n8n | 5678 | `/` (default) | Workflow automation |
| Data Fetcher 2.0 | 8080 | `/api/data-fetcher-2.0/*`, `/api/fred/*` | Unified market data worker |
| Metrics | 8080 | `/api/metrics/*` | Metrics aggregation |
| Back-office | 3000 | `/back-office*` | Admin UI |
| Alloy | 12345 | — (internal) | Metrics/logs forwarder to Grafana Cloud |
| Gateway 2.0 | 8080 | — (internal) | TypeScript AI gateway (Claude, cursor-agent, Telegram) |

**Gateway 2.0 Docker Container**: Accesses CLIs (cursor-agent) installed on the VM host via volume mounts. Other containers access it via `gateway-2.0:8080` with `X-API-Key` header.

## File Structure on VM

```
/opt/stocktracker/
├── docker-compose.yml      # Synced from repo
├── Caddyfile               # Synced from repo
├── alloy-config.alloy      # Synced from repo (Grafana Alloy config)
├── config/                 # Infisical auth config (Machine Identity)
├── n8n-data/               # n8n persistent data
├── logs/                   # Job logs
├── scripts/
│   ├── setup.sh            # Initial VM setup
│   ├── start-services.sh   # Docker compose with Infisical injection
│   ├── run-data-fetcher.sh  # Cron job script (if needed)
│   └── weekly-cleanup.sh   # Old data cleanup
└── repo/                   # Git clone of repository
    └── services/           # Source code
```

## Caddy Routes (Actual Configuration)

```caddyfile
nxserver.malaysiawest.cloudapp.azure.com {
    # Data Fetcher 2.0 API
    handle_path /api/data-fetcher-2.0/* {
        reverse_proxy data-fetcher-2.0:8080
    }
    
    # FRED API (routed via handle, not handle_path - preserves /api/fred prefix)
    handle /api/fred/* {
        reverse_proxy data-fetcher-2.0:8080
    }
    
    # Metrics Service API
    handle_path /api/metrics/* {
        reverse_proxy metrics:8080
    }
    
    # Back Office - Admin UI
    handle /back-office* {
        reverse_proxy back-office:3000
    }
    
    # n8n - Default (root path)
    handle {
        reverse_proxy n8n:5678
    }
}

# NOTE: Gateway 2.0 is NOT exposed via Caddy (except /api/gateway-2/* proxy routes)
# Internal access via Docker network: gateway-2.0:8080
```

## Public URLs

| Service | URL | Notes |
|---------|-----|-------|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ | Workflow automation |
| Data Fetcher 2.0 Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/data-fetcher-2.0/swagger | API docs |
| Data Fetcher 2.0 Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/data-fetcher-2.0/health/live | Health check |
| FRED API | https://nxserver.malaysiawest.cloudapp.azure.com/api/fred/* | Via data-fetcher-2.0 |
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger | API docs |
| Metrics Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live | Health check |
| Back Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office/ | Admin UI |
| Gateway 2.0 | gateway-2.0:8080 (Docker network) | Internal only |

## Health Check Commands

```bash
# Public endpoints
curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/api/data-fetcher-2.0/health/live
curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live
curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/back-office/

# Docker container status
ssh azureuser@20.17.176.1 "docker ps"

# Gateway 2.0 health (via Docker)
ssh azureuser@20.17.176.1 "docker exec gateway-2.0 curl -sf http://localhost:8080/health/live"
```

## Related Documents

- [Core Context](../rules/core-context.md) - Project overview and tech stack
- [CI/CD Deployment](../rules/cicd-deployment.md) - Pipeline details
- [Secrets Management](../rules/secrets-infisical.md) - Infisical workflow
- [AI Hub Architecture](ai-hub-architecture.md) - Legacy AI service details (superseded by gateway-2.0)
- [Worker Endpoints](../cli/caddy/worker-endpoints.md) - Caddy routes reference
