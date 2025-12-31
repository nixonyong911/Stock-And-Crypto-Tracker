# VM Deployment Architecture

**Last Updated**: December 31, 2025

## Overview

All backend services run on a single Azure VM using Docker Compose, with Caddy as the reverse proxy providing automatic HTTPS. AI Hub runs directly on the host as a systemd service (not in Docker) to access CLIs installed on the host.

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
│   │   │      ├── /api/twelvedata/*    → twelvedata:8080                  │    │  │
│   │   │      ├── /api/metrics/*       → metrics:8080                     │    │  │
│   │   │      └── /back-office*        → back-office:3000                 │    │  │
│   │   │                                                                  │    │  │
│   │   │      NOTE: AI Hub NOT exposed (internal only at :8084)           │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                                         │                                 │  │
│   │   ┌─────────────────────────────────────┼───────────────────────────┐    │  │
│   │   │              DOCKER CONTAINERS      │                           │    │  │
│   │   ├──────────────┬──────────────┬───────┴──────┬──────────────┬─────┤    │  │
│   │   │     n8n      │  TwelveData  │   Metrics    │  Back-office │Alloy│    │  │
│   │   │   :5678      │    :8080     │    :8080     │    :3000     │     │    │  │
│   │   │  Workflows   │  Stock Data  │  Aggregates  │   Admin UI   │Logs │    │  │
│   │   └──────────────┴──────────────┴──────────────┴──────────────┴─────┘    │  │
│   │              │              │              │              │               │  │
│   │              └──────────────┴──────────────┴──────────────┘               │  │
│   │                          host.docker.internal:8084                        │  │
│   │                                    │                                      │  │
│   │   ┌────────────────────────────────▼────────────────────────────────┐    │  │
│   │   │              AI HUB (systemd service on HOST)                    │    │  │
│   │   │              Port 8084 - Internal only                           │    │  │
│   │   │              FastAPI + Claude CLI + Cursor-agent CLI             │    │  │
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
│   │              │      │  (parallel)  │      │  4. AI Hub: systemd restart  │  │
│   │              │      │              │      │  5. Health checks            │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────────┘  │
│                                                                                  │
│   Trigger Paths:                                                                 │
│   - services/data-fetchers/TwelveData/**                                        │
│   - services/metrics/**                                                          │
│   - services/ai/ai-hub/**                                                        │
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
│   │ DATABASE_CONNECTION_STRING         │ TwelveData, AI-Hub (local)        │    │
│   │ TWELVE_DATA_API_KEY                │ TwelveData Worker                 │    │
│   │ AI_HUB_API_KEY                     │ n8n, TwelveData, Metrics, Back-office │ │
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
| TwelveData | 8080 | `/api/twelvedata/*` | Stock data worker |
| Metrics | 8080 | `/api/metrics/*` | Metrics aggregation |
| Back-office | 3000 | `/back-office*` | Admin UI |
| Alloy | 12345 | — (internal) | Metrics/logs forwarder to Grafana Cloud |

### Host Service (systemd)

| Service | Port | Access | Description |
|---------|------|--------|-------------|
| AI Hub | 8084 | Internal only | AI CLI gateway (claude, cursor-agent) |

**Why AI Hub runs on host**: Needs direct access to CLIs (claude, cursor-agent) installed on the VM. Docker containers access it via `host.docker.internal:8084` with `X-API-Key` header.

## File Structure on VM

```
/opt/stocktracker/
├── docker-compose.yml      # Synced from repo
├── Caddyfile               # Synced from repo
├── alloy-config.alloy      # Synced from repo (Grafana Alloy config)
├── ai-hub-venv/            # Python venv for AI Hub (cached by requirements hash)
├── config/                 # Infisical auth config (Machine Identity)
├── n8n-data/               # n8n persistent data
├── logs/                   # Job logs
├── scripts/
│   ├── setup.sh            # Initial VM setup
│   ├── start-services.sh   # Docker compose with Infisical injection
│   ├── start-ai-hub.sh     # AI Hub startup script
│   ├── ai-hub.service      # Systemd unit file
│   ├── run-twelvedata.sh   # Cron job script (if needed)
│   └── weekly-cleanup.sh   # Old data cleanup
└── repo/                   # Git clone of repository
    └── services/           # Source code
```

## Caddy Routes (Actual Configuration)

```caddyfile
nxserver.malaysiawest.cloudapp.azure.com {
    # TwelveData Worker API
    handle_path /api/twelvedata/* {
        reverse_proxy twelvedata:8080
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

# NOTE: AI Hub is NOT exposed via Caddy
# Internal access only: host.docker.internal:8084
```

## Public URLs

| Service | URL | Notes |
|---------|-----|-------|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ | Workflow automation |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger | API docs |
| TwelveData Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live | Health check |
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger | API docs |
| Metrics Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live | Health check |
| Back Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office/ | Admin UI |
| AI Hub | localhost:8084 (via SSH) | Internal only |

## Health Check Commands

```bash
# From local machine (via SSH)
ssh azureuser@20.17.176.1 "curl -sf http://localhost:8084/health/live"  # AI Hub

# Public endpoints
curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live
curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live
curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/back-office/

# Docker container status
ssh azureuser@20.17.176.1 "docker ps"

# AI Hub systemd status
ssh azureuser@20.17.176.1 "sudo systemctl status ai-hub"
```

## Related Documents

- [Core Context](../rules/core-context.md) - Project overview and tech stack
- [CI/CD Deployment](../rules/cicd-deployment.md) - Pipeline details
- [Secrets Management](../rules/secrets-infisical.md) - Infisical workflow
- [AI Hub Architecture](ai-hub-architecture.md) - AI service details
- [Worker Endpoints](../cli/caddy/worker-endpoints.md) - Caddy routes reference
