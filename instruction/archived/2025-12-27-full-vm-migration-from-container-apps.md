# Full Migration: Azure Container Apps → Azure VM

**Date**: December 27, 2025  
**Status**: ✅ Phase 1 Complete

## Overview

Complete migration of all backend services from Azure Container Apps (ACA) to a single Azure VM with Docker, Caddy reverse proxy, and GitHub Actions CI/CD.

## Problem Statement

Azure Container Apps had multiple issues:
1. **0-Replica Problem**: Workers scaled to 0 replicas when no HTTP traffic, preventing scheduled jobs from running
2. **Cost Inefficiency**: Paying for Container Apps Environment even when services weren't running
3. **Limited Customization**: Less control over networking, scheduling, and debugging

## Migration Scope

### Services Migrated to VM

| Service | Status | Notes |
|---------|--------|-------|
| **TwelveData Worker** | ✅ Running | Swagger at `/api/twelvedata/swagger` |
| **n8n** | ✅ Running | Root path `/` |
| **Caddy** | ✅ Running | Reverse proxy with auto-SSL |

### Services Pending (Phase 2)

| Service | Status | Notes |
|---------|--------|-------|
| **Metrics Service** | ⏸️ Disabled | Needs testing |
| **AI-Hub** | ⏸️ Disabled | Needs API keys |

### Services Retired

| Service | Status | Notes |
|---------|--------|-------|
| **AlphaVantage Worker** | ❌ Removed | Replaced by TwelveData |

### Azure Resources Deleted

| Resource | Type | Reason |
|----------|------|--------|
| `ca-twelvedata` | Container App | Migrated to VM |
| `ca-metrics` | Container App | Migrated to VM |
| `ca-alphavantage` | Container App | Service retired |
| `cae-stocktracker` | Container Apps Environment | No longer needed |

## New Architecture

### Before (Azure Container Apps)

```
GitHub Actions
    │
    ├──► ACR (Build & Push Images)
    │         │
    │         └──► Azure Container Apps
    │                   ├── ca-twelvedata
    │                   ├── ca-metrics
    │                   └── ca-alphavantage
    │
    └──► Vercel (Frontend)
```

### After (Azure VM)

```
GitHub Actions
    │
    ├──► SSH to VM ──► Build Images Locally ──► Docker Compose
    │                         │
    │                         └──► Azure VM (nx-linux-server-azure)
    │                               ├── caddy (reverse proxy)
    │                               ├── n8n (workflow automation)
    │                               ├── twelvedata (stock data)
    │                               ├── metrics (Phase 2)
    │                               └── ai-hub (Phase 2)
    │
    └──► Vercel (Frontend - unchanged)
```

## Files Created

### Deployment Configuration

```
deployment/vm/
├── docker-compose.yml    # All services definition
├── Caddyfile             # Reverse proxy routes
└── scripts/
    ├── setup.sh          # VM initial setup
    └── run-twelvedata.sh # Cron job script
```

### CI/CD Pipeline

```
.github/workflows/
├── deploy-azure.yml      # DELETED (old ACA pipeline)
└── deploy-vm.yml         # NEW (VM deployment)
```

## CI/CD Pipeline Details

### Workflow: `deploy-vm.yml`

**Triggers**:
- Push to `main` branch with changes in:
  - `services/data-fetchers/TwelveData/**`
  - `services/common/**`
  - `deployment/vm/**`
  - `.github/workflows/deploy-vm.yml`
- Manual trigger via `workflow_dispatch`

**Steps**:
1. Checkout repository
2. Setup SSH connection to VM
3. Sync repository via `git fetch/reset`
4. Copy config files (`docker-compose.yml`, `Caddyfile`)
5. Build Docker images on VM
6. Start services with `docker compose up -d`
7. Verify health endpoints

### Secrets Required in GitHub

| Secret | Purpose |
|--------|---------|
| `VM_SSH_PRIVATE_KEY` | SSH access to VM |
| `DATABASE_CONNECTION_STRING` | Supabase connection |
| `TWELVE_DATA_API_KEY` | TwelveData API |
| `PAT_GITHUB` | Clone private repo (if needed) |

## Scheduled Jobs

### TwelveData Daily Fetch

| Property | Value |
|----------|-------|
| Schedule | `0 6 * * 1-5` (06:00 UTC Mon-Fri) |
| Mode | Container runs via cron |
| Log Location | `/opt/stocktracker/logs/` |

```bash
# Cron entry
0 6 * * 1-5 /opt/stocktracker/scripts/run-twelvedata.sh
```

## Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ | Workflow automation |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger | API docs |
| TwelveData Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live | Health check |

## VM Details

| Property | Value |
|----------|-------|
| Name | nx-linux-server-azure |
| Resource Group | NIXON-CITY |
| Size | Standard_B2s (2 vCPU, 4GB RAM) |
| Location | Malaysia West |
| Public IP | 20.17.176.1 |
| DNS | nxserver.malaysiawest.cloudapp.azure.com |
| SSH | `ssh-azure` (PowerShell alias) |

## Key Decisions Made

### 1. Caddy over Nginx
- **Reason**: Simpler config, automatic HTTPS via Let's Encrypt
- **Tradeoff**: CaddyManager GUI not available (image access denied)

### 2. Build on VM vs ACR
- **Reason**: Simpler pipeline, no ACR costs, faster iteration
- **Tradeoff**: Slower builds on small VM

### 3. GitHub Secrets over Infisical on VM
- **Reason**: Simpler setup, Infisical auto-syncs to GitHub anyway
- **Tradeoff**: One more hop (Infisical → GitHub → VM)

### 4. AlphaVantage Retired
- **Reason**: TwelveData provides better data quality
- **Action**: Service removed from deployment entirely

## Rollback Plan

If VM deployment fails:

1. **Re-enable Container Apps** (not recommended - same issues):
   ```powershell
   # Would need to recreate from scratch
   ```

2. **Manual Docker on VM**:
   ```bash
   ssh azureuser@20.17.176.1
   cd /opt/stocktracker
   docker compose down
   docker compose up -d
   ```

## Related Documentation

- [New Architecture Overview](../../architecture/vm-deployment-architecture.md)
- [Worker Endpoints](../../cli/caddy/worker-endpoints.md)
- [Phase 2 TODO](../../todo/phase-2-vm-services.md)
- [Infisical Secrets](../../architecture/infisical-secrets-management.md)

## Lessons Learned

1. **Container Apps 0-replica issue** is common for background workers - VM with cron is simpler
2. **Local Docker builds** on VM are viable for small projects
3. **Caddy** significantly simplifies HTTPS setup compared to certbot
4. **Single VM** is more cost-effective than multiple managed services for small scale

