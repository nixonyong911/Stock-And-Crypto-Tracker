# Metrics Service Architecture

## Overview

Centralized metrics aggregation service that collects metrics from all workers and exposes them to Grafana Cloud via Alloy.

**Key Benefits:**
- Single Prometheus scrape endpoint for all workers
- Workers push metrics via HTTP (no direct Prometheus scraping of workers)
- Grafana Cloud integration for dashboards and alerting
- 14-day retention on free tier

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Azure VM (nxserver)                                 │
│                                                                                  │
│  ┌─────────────┐    POST /api/metrics    ┌──────────────────┐                   │
│  │ TwelveData  │ ──────────────────────► │                  │                   │
│  │   Worker    │                         │  Metrics Service │◄─── Alloy scrapes │
│  └─────────────┘                         │   (port 8080)    │     /metrics      │
│                                          │                  │         │         │
│  ┌─────────────┐    POST /api/metrics    │  - Aggregates    │         │         │
│  │   Future    │ ──────────────────────► │    all metrics   │         │         │
│  │   Workers   │                         │  - Exposes       │         │         │
│  └─────────────┘                         │    /metrics      │         ▼         │
│                                          └──────────────────┘   ┌─────────┐     │
│                                                                 │  Alloy  │     │
│                                                                 │Container│     │
│                                                                 └────┬────┘     │
└──────────────────────────────────────────────────────────────────────┼──────────┘
                                                                       │
                                                          remote_write │
                                                                       ▼
                                                          ┌────────────────────┐
                                                          │   Grafana Cloud    │
                                                          │                    │
                                                          │  - Dashboards      │
                                                          │  - Alerting        │
                                                          │  - 14-day retention│
                                                          └────────────────────┘
```

**Key Principle:** Workers PUSH metrics to the Metrics Service. Grafana/Alloy only scrapes the Metrics Service.

---

## Components

### 1. Metrics Service

| Property | Value |
|----------|-------|
| Container | `metrics` |
| Image | Built from `services/metrics/StockTracker.Metrics/Dockerfile` |
| Port | 8080 (internal) |
| Public URL | `https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/` |
| Swagger | `https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger` |

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health/live` | GET | Liveness check |
| `/api/metrics` | POST | Record single metric |
| `/api/metrics/batch` | POST | Record batch metrics |
| `/api/metrics/workers` | GET | List registered workers |
| `/metrics` | GET | Prometheus scrape endpoint |

### 2. Grafana Alloy

| Property | Value |
|----------|-------|
| Container | `alloy` |
| Image | `grafana/alloy:latest` |
| Config | `/opt/stocktracker/alloy-config.alloy` |
| Purpose | Scrapes Metrics Service, forwards to Grafana Cloud |

### 3. Grafana Cloud

| Property | Value |
|----------|-------|
| Stack | `stockandcryptotracker` |
| Region | `prod-ap-southeast-1` |
| Datasource | `grafanacloud-stockandcryptotracker-prom` |
| Free Tier Limits | 10K metrics, 14-day retention |

---

## Configuration

### Alloy Config

**File:** `deployment/vm/alloy-config.alloy`

```alloy
prometheus.scrape "metrics_service" {
  targets = [{ __address__ = "metrics:8080" }]
  forward_to = [prometheus.remote_write.grafana_cloud.receiver]
  scrape_interval = "30s"
  metrics_path = "/metrics"
  job_name = "stocktracker-metrics"
}

prometheus.remote_write "grafana_cloud" {
  endpoint {
    url = "https://prometheus-prod-37-prod-ap-southeast-1.grafana.net/api/prom/push"
    basic_auth {
      username = "2855049"
      password = env("GRAFANA_CLOUD_API_KEY")
    }
  }
  external_labels = {
    environment = "production"
    project = "stocktracker"
    host = "azure-vm"
  }
}
```

### Docker Compose

Services defined in `deployment/vm/docker-compose.yml`:
- `metrics` - Central metrics aggregation
- `alloy` - Grafana Cloud forwarder

---

## Secrets

| Secret | Location | Purpose |
|--------|----------|---------|
| `GRAFANA_CLOUD_API_KEY` | Infisical → GitHub Secrets | Alloy auth to Grafana Cloud |

**Token Format:** `glc_eyJvIjo...` (Grafana Cloud Access Policy token)

---

## Verification

```bash
# Check services running
docker ps

# Check Metrics Service
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live

# Check Alloy logs
docker logs alloy --tail 20

# Check registered workers
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/workers
```

### Grafana Cloud Queries

| Query | Purpose |
|-------|---------|
| `up` | Service health |
| `{job="stocktracker-metrics"}` | All metrics |
| `up{project="stocktracker"}` | Filtered by project |

---

## Troubleshooting

### 401 Unauthorized in Alloy logs

**Cause:** Invalid or missing `GRAFANA_CLOUD_API_KEY`

**Fix:**
1. Create new token in Grafana Cloud → Access Policies
2. Update secret in Infisical/GitHub
3. Re-deploy via GitHub Actions

### Metrics not appearing in Grafana

**Cause:** Alloy not scraping or forwarding

**Fix:**
1. Check `docker logs alloy`
2. Verify Metrics Service is healthy
3. Restart Alloy: `docker compose restart alloy`

---

## Files

| File | Purpose |
|------|---------|
| `services/metrics/StockTracker.Metrics/Program.cs` | Metrics service app |
| `services/metrics/StockTracker.Metrics/Dockerfile` | Container build |
| `deployment/vm/docker-compose.yml` | Service definitions |
| `deployment/vm/Caddyfile` | Reverse proxy route |
| `deployment/vm/alloy-config.alloy` | Alloy configuration |
| `.github/workflows/deploy-vm.yml` | CI/CD triggers |



