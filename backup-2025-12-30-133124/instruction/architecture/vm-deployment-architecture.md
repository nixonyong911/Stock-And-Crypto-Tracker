# VM Deployment Architecture

**Last Updated**: December 27, 2025

## Overview

All backend services run on a single Azure VM using Docker Compose, with Caddy as the reverse proxy providing automatic HTTPS.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐                                            ┌─────────────┐   │
│   │   FRONTEND   │                                            │  DATABASE   │   │
│   │   (Vercel)   │                                            │ (Supabase)  │   │
│   ├──────────────┤                                            ├─────────────┤   │
│   │              │                                            │             │   │
│   │  Next.js 14  │                                            │ PostgreSQL  │   │
│   │              │                                            │             │   │
│   └──────┬───────┘                                            └──────▲──────┘   │
│          │                                                           │          │
│          │ Supabase Client                          Supabase Client  │          │
│          │                                                           │          │
│          ▼                                                           │          │
│   ┌──────────────────────────────────────────────────────────────────┴───────┐  │
│   │                         AZURE VM (nx-linux-server-azure)                  │  │
│   │                         20.17.176.1 / Standard_B2s                        │  │
│   ├──────────────────────────────────────────────────────────────────────────┤  │
│   │                                                                           │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐    │  │
│   │   │                    CADDY (Reverse Proxy)                         │    │  │
│   │   │                    Auto HTTPS via Let's Encrypt                  │    │  │
│   │   │   :443 ──────────────────────────────────────────────────────    │    │  │
│   │   │      │                                                           │    │  │
│   │   │      ├── /                    → n8n:5678                         │    │  │
│   │   │      ├── /api/twelvedata/*    → twelvedata:8080                  │    │  │
│   │   │      ├── /api/metrics/*       → metrics:8080 (Phase 2)           │    │  │
│   │   │      └── /api/ai-hub/*        → ai-hub:8080 (Phase 2)            │    │  │
│   │   └─────────────────────────────────────────────────────────────────┘    │  │
│   │                                         │                                 │  │
│   │   ┌──────────────┐  ┌──────────────┐  ┌┴─────────────┐  ┌─────────────┐  │  │
│   │   │     n8n      │  │  TwelveData  │  │   Metrics    │  │   AI-Hub    │  │  │
│   │   │              │  │    Worker    │  │   Service    │  │   Gateway   │  │  │
│   │   │  :5678       │  │    :8080     │  │    :8080     │  │    :8080    │  │  │
│   │   │              │  │              │  │              │  │             │  │  │
│   │   │  Workflows   │  │  Stock Data  │  │  Aggregates  │  │  AI Models  │  │  │
│   │   │  Automation  │  │  Fetching    │  │  Metrics     │  │  Gateway    │  │  │
│   │   └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │  │
│   │         ✅               ✅                 ⏸️                ⏸️          │  │
│   │       Active           Active            Phase 2          Phase 2        │  │
│   │                                                                           │  │
│   └───────────────────────────────────────────────────────────────────────────┘  │
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
│   │              │      │  Triggers:   │      │  2. docker compose build     │  │
│   │              │      │  - main push │      │  3. docker compose up -d     │  │
│   │              │      │  - manual    │      │  4. Health checks            │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────────┘  │
│                                                                                  │
│   Trigger Paths:                                                                 │
│   - services/data-fetchers/TwelveData/**                                        │
│   - services/common/**                                                           │
│   - deployment/vm/**                                                             │
│   - .github/workflows/deploy-vm.yml                                              │
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
│         │         └──► GitHub Actions ──► SSH ──► VM Environment Variables       │
│         │                                                                        │
│         └──► Vercel (auto-sync for frontend)                                     │
│                                                                                  │
│   Secrets Inventory:                                                             │
│   ┌────────────────────────────────────┬───────────────────────────────────┐    │
│   │ Secret                             │ Used By                           │    │
│   ├────────────────────────────────────┼───────────────────────────────────┤    │
│   │ DATABASE_CONNECTION_STRING         │ TwelveData, Metrics, AI-Hub       │    │
│   │ TWELVE_DATA_API_KEY                │ TwelveData Worker                 │    │
│   │ VM_SSH_PRIVATE_KEY                 │ GitHub Actions                    │    │
│   │ PAT_GITHUB                         │ Clone private repo (if needed)    │    │
│   │ AI_KEY_...GOOGLE_GEMINI_3_FLASH    │ AI-Hub (Phase 2)                  │    │
│   │ GOOGLE_CLOUD_PROJECT_ID            │ AI-Hub (Phase 2)                  │    │
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
| **OS** | Ubuntu 22.04 LTS |
| **Docker** | Docker Compose v2 |

## Service Ports (Internal)

| Service | Port | Notes |
|---------|------|-------|
| Caddy | 80, 443, 2019 | 2019 is admin API |
| n8n | 5678 | Internal only |
| TwelveData | 8080 | Internal only |
| Metrics | 8080 | Phase 2 |
| AI-Hub | 8080 | Phase 2 |

## File Structure on VM

```
/opt/stocktracker/
├── docker-compose.yml      # Synced from repo
├── Caddyfile               # Synced from repo
├── n8n-data/               # n8n persistent data
├── logs/                   # Job logs
├── scripts/
│   ├── setup.sh            # Initial setup
│   └── run-twelvedata.sh   # Cron job script
└── repo/                   # Git clone of repository
    └── services/           # Source code
```

## Comparison: Before vs After

| Aspect | Before (ACA) | After (VM) |
|--------|--------------|------------|
| **Hosting** | Azure Container Apps | Azure VM |
| **Registry** | Azure Container Registry | Local Docker build |
| **Proxy** | Azure managed | Caddy (self-managed) |
| **SSL** | Azure managed | Let's Encrypt (auto) |
| **Cost** | ~$30-50/month | VM cost only (~$15/month) |
| **Scaling** | Auto (to 0) | Manual |
| **Debugging** | Limited | Full SSH access |
| **Scheduling** | Container Apps Job | Linux cron |

## Health Check URLs

| Service | URL | Expected |
|---------|-----|----------|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ | 200 or login page |
| TwelveData | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live | `Healthy` |

## Related Documents

- [Migration History](./2025-12-27-full-vm-migration-from-container-apps.md)
- [Worker Endpoints](../cli/caddy/worker-endpoints.md)
- [Phase 2 TODO](../todo/phase-2-vm-services.md)
- [Infrastructure Reference](infrastructure-reference.md)

