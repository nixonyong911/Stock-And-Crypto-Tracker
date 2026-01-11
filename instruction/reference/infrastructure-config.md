# Infrastructure Configuration Reference

**Category**: Infrastructure Reference
**Last Updated**: 2026-01-01
**Purpose**: Single source of truth for infrastructure values

---

## Overview

This document centralizes all infrastructure configuration values to prevent hardcoded values scattered across multiple files. When infrastructure changes, update this file first, then update references.

---

## Azure VM Configuration

### VM Instance Details

| Property | Value |
|----------|-------|
| **VM Name** | `nx-linux-server-azure` |
| **Public IP** | `20.17.176.1` |
| **FQDN** | `nxserver.malaysiawest.cloudapp.azure.com` |
| **Region** | `Malaysia West` |
| **OS** | Ubuntu 24.04 LTS |
| **SSH User** | `azureuser` |

### SSH Access

| Property | Value |
|----------|-------|
| **SSH Alias** | `ssh-azure` |
| **SSH Key Path** | `$HOME\.ssh\nx-linux-server-azure_key (1).pem` (Windows) |
| **SSH Key Path** | `~/.ssh/nx-linux-server-azure_key\ \(1\).pem` (Linux/Mac) |
| **Direct SSH Command** | `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1` |

### Deployment Paths

| Path Type | Location |
|-----------|----------|
| **Deploy Root** | `/opt/stocktracker` |
| **Docker Compose** | `/opt/stocktracker/docker-compose.yml` |
| **Caddyfile** | `/opt/stocktracker/Caddyfile` |
| **Scripts** | `/opt/stocktracker/scripts/` |
| **n8n Data** | `/opt/stocktracker/n8n-data/` |
| **Repository Clone** | `/opt/stocktracker/repo/` |
| **AI Hub Code** | `/opt/stocktracker/repo/services/ai/ai-hub/` |

---

## Service Ports & Endpoints

### External Ports (Public via Caddy)

| Service | Internal Port | External URL |
|---------|---------------|--------------|
| **Caddy HTTP** | 80 | http://nxserver.malaysiawest.cloudapp.azure.com |
| **Caddy HTTPS** | 443 | https://nxserver.malaysiawest.cloudapp.azure.com |

### Internal Service Ports

| Service | Container Port | Protocol | Accessible Via |
|---------|----------------|----------|----------------|
| **n8n** | 5678 | HTTP | Caddy reverse proxy at `/` |
| **TwelveData** | 8080 | HTTP | Caddy reverse proxy at `/api/twelvedata` |
| **Metrics** | 8080 | HTTP | Caddy reverse proxy at `/api/metrics` |
| **Back-office** | 3000 | HTTP | Caddy reverse proxy at `/back-office` |
| **AI Hub** | 8080 | HTTP | Docker internal only - `ai-hub-docker:8080` |
| **Alloy** | 12345 | HTTP | Internal monitoring only |
| **Caddy Admin API** | 2019 | HTTP | localhost only (via SSH) |

### Service URLs (Public Access)

| Service | URL | Purpose |
|---------|-----|---------|
| **n8n Dashboard** | https://nxserver.malaysiawest.cloudapp.azure.com/ | Workflow automation UI |
| **TwelveData Swagger** | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger | Stock data API docs |
| **TwelveData Health** | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live | Health check endpoint |
| **Metrics Swagger** | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger | Metrics API docs |
| **Metrics Prometheus** | https://nxserver.malaysiawest.cloudapp.azure.com/metrics | Prometheus metrics (scraped by Alloy) |
| **Metrics Health** | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live | Health check endpoint |
| **Back-office UI** | https://nxserver.malaysiawest.cloudapp.azure.com/back-office | Admin dashboard |
| **AI Hub Health** | http://ai-hub-docker:8080/health/live | Health check (Docker network) |

---

## Docker Configuration

### Network

| Property | Value |
|----------|-------|
| **Network Name** | `stocktracker` |
| **Network Driver** | `bridge` |
| **Docker DNS** | `host.docker.internal` (resolves to VM host) |

### Volumes

| Volume Name | Purpose |
|-------------|---------|
| `caddy-data` | Caddy TLS certificates |
| `caddy-config` | Caddy configuration cache |
| `./n8n-data` | n8n workflows and credentials (bind mount) |

### Build Contexts

| Service | Context Path | Dockerfile Path |
|---------|--------------|-----------------|
| **TwelveData** | `./repo/services` | `data-fetchers/TwelveData/Dockerfile` |
| **Metrics** | `./repo/services` | `metrics/StockTracker.Metrics/Dockerfile` |
| **Back-office** | `./repo/services/back-office` | `Dockerfile` |

---

## External Services

### Supabase (Database)

| Property | Value |
|----------|-------|
| **Project Ref** | See `.env` (stored in Infisical) |
| **Public URL** | `NEXT_PUBLIC_SUPABASE_URL` env var |
| **Database Host** | `db.{project-ref}.supabase.co` |
| **Database Port** | `5432` (direct), `6543` (pooler) |
| **Database Name** | `postgres` |
| **Connection Pooling** | Transaction mode via Supavisor |

### Grafana Cloud

| Property | Value |
|----------|-------|
| **Dashboard URL** | https://stockandcryptotracker.grafana.net/ |
| **Metrics Endpoint** | Configured in Alloy (via `GRAFANA_CLOUD_API_KEY`) |
| **Logs Endpoint** | Loki (via `GRAFANA_CLOUD_LOKI_USER`) |
| **Scrape Interval** | 15 seconds (Alloy config) |

### Infisical (Secrets Management)

| Property | Value |
|----------|-------|
| **Cloud URL** | https://app.infisical.com |
| **Workspace ID** | Stored in `.infisical.json` (safe to commit) |
| **Environment** | `prod` |
| **Sync Targets** | GitHub Secrets, Vercel |

### Vercel (Frontend)

| Property | Value |
|----------|-------|
| **Frontend URL** | https://your-frontend.vercel.app (update if deployed) |
| **Deployment** | Auto-deploy from `main` branch |

---

## Environment Variables Map

### Common Variables (All Services)

| Variable | Source | Purpose |
|----------|--------|---------|
| `AI_HUB_URL` | Docker Compose | `http://ai-hub-docker:8080` |
| `AI_HUB_API_KEY` | Infisical | Authentication for AI Hub |
| `ASPNETCORE_ENVIRONMENT` | Docker Compose | `Production` for .NET services |

### Service-Specific Variables

#### TwelveData Worker
- `ConnectionStrings__DefaultConnection` → `DATABASE_CONNECTION_STRING` (Infisical)
- `TwelveData__ApiKey` → `TWELVE_DATA_API_KEY` (Infisical)
- `PATH_BASE` → `/api/twelvedata`

#### Metrics Service
- `PATH_BASE` → `/api/metrics`

#### Back-office
- `NEXT_PUBLIC_SUPABASE_URL` → Infisical (build-time)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` → Infisical (build-time)

#### n8n
- `WEBHOOK_URL` → `https://nxserver.malaysiawest.cloudapp.azure.com`
- `N8N_EDITOR_BASE_URL` → `https://nxserver.malaysiawest.cloudapp.azure.com`

#### Grafana Alloy
- `GRAFANA_CLOUD_API_KEY` → Infisical
- `GRAFANA_CLOUD_LOKI_USER` → Infisical

---

## Service Health Checks

### Docker Health Check Patterns

| Service | Health Check Command | Interval | Timeout |
|---------|---------------------|----------|---------|
| **TwelveData** | `curl -f http://localhost:8080/health/live` | 30s | 3s |
| **Metrics** | `curl -f http://localhost:8080/health/live` | 30s | 3s |
| **Back-office** | `wget -qO- http://127.0.0.1:3000/back-office` | 30s | 3s |

### AI Hub Docker Container

| Property | Value |
|----------|-------|
| **Container Name** | `ai-hub-docker` |
| **Status Command** | `docker ps --filter name=ai-hub-docker` |
| **Restart Command** | `docker restart ai-hub-docker` |
| **Logs Command** | `docker logs ai-hub-docker -f` |
| **Health Endpoint** | `http://localhost:8080/health/live` (inside container) |

---

## CI/CD Configuration

### GitHub Actions Workflow

| Property | Value |
|----------|-------|
| **Workflow File** | `.github/workflows/deploy-vm.yml` |
| **Trigger Paths** | `services/**`, `deployment/vm/**` |
| **SSH User** | `azureuser` |
| **Deploy Host** | `20.17.176.1` |
| **Deploy Path** | `/opt/stocktracker` |

### Deployment Steps (Automated)

1. Build Docker images locally (GitHub runner)
2. Save images to tar files
3. SSH copy tar files to VM
4. SSH load images on VM
5. SSH run docker compose up
6. Health check verification

---

## Quick Reference Commands

### Check VM Services
```bash
# Direct SSH (fastest)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps"

# Or use alias for interactive session
ssh-azure
```

### View Service Logs
```bash
# Specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata --tail 50"

# All services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose logs -f"

# AI Hub (Docker)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs ai-hub-docker --tail 50"
```

### Restart Services
```bash
# Specific Docker service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart twelvedata"

# All Docker services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart"

# AI Hub
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker restart ai-hub-docker"
```

---

## When to Update This Document

Update this file when:
- VM IP address changes
- FQDN changes
- Deploy paths change
- New services added
- Service ports change
- External service URLs change

After updating, also update:
- `rules/vm-operations.md`
- `skills/cli-*/SKILL.md` files
- `.github/workflows/deploy-vm.yml` (add reference comment)
- Any hardcoded values in other documentation

---

## Related Documentation

- [VM Operations](../rules/vm-operations.md)
- [CI/CD Deployment](../rules/cicd-deployment.md)
- [Docker Conventions](../conventions/docker.md)
- [Observability Guide](./observability-guide.md)
