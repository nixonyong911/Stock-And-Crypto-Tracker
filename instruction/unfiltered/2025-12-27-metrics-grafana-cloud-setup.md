# Metrics & Grafana Cloud Setup - Implementation Notes

**Date**: December 27, 2025  
**Status**: Completed  
**Related**: Phase 2 VM Services

---

## Overview

This document captures the implementation of centralized monitoring using the Metrics Service and Grafana Cloud integration.

---

## Architecture

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

---

## Components Deployed

### 1. Metrics Service
- **Container**: `metrics`
- **Image**: Built from `services/metrics/StockTracker.Metrics/Dockerfile`
- **Port**: 8080 (internal)
- **Public URL**: https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/
- **Swagger**: https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger

**Endpoints**:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health/live` | GET | Liveness check |
| `/api/metrics` | POST | Record single metric |
| `/api/metrics/batch` | POST | Record batch metrics |
| `/api/metrics/workers` | GET | List registered workers |
| `/metrics` | GET | Prometheus scrape endpoint |

### 2. Grafana Alloy
- **Container**: `alloy`
- **Image**: `grafana/alloy:latest`
- **Config**: `/opt/stocktracker/alloy-config.alloy`
- **Purpose**: Scrapes Metrics Service, forwards to Grafana Cloud

### 3. Grafana Cloud
- **Stack**: `stockandcryptotracker`
- **Region**: `prod-ap-southeast-1`
- **Datasource**: `grafanacloud-stockandcryptotracker-prom`
- **Free Tier Limits**: 10K metrics, 14-day retention

---

## Configuration Files

### Alloy Config (`deployment/vm/alloy-config.alloy`)
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

### Docker Compose Services Added
- `metrics` - Central metrics aggregation
- `alloy` - Grafana Cloud forwarder

---

## Secrets Required

| Secret | Location | Purpose |
|--------|----------|---------|
| `GRAFANA_CLOUD_API_KEY` | Infisical → GitHub Secrets | Alloy auth to Grafana Cloud |

**Token Format**: `glc_eyJvIjo...` (Grafana Cloud Access Policy token)

---

## Verification Commands

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
- `up` - Service health
- `{job="stocktracker-metrics"}` - All metrics
- `up{project="stocktracker"}` - Filtered by project

---

## Troubleshooting

### Issue: 401 Unauthorized in Alloy logs
**Cause**: Invalid or missing `GRAFANA_CLOUD_API_KEY`
**Fix**: 
1. Create new token in Grafana Cloud → Access Policies
2. Update secret in Infisical/GitHub
3. Re-deploy via GitHub Actions

### Issue: Metrics not appearing in Grafana
**Cause**: Alloy not scraping or forwarding
**Fix**:
1. Check `docker logs alloy`
2. Verify Metrics Service is healthy
3. Restart Alloy: `docker compose restart alloy`

---

## Files Changed in This Implementation

| File | Change |
|------|--------|
| `services/metrics/StockTracker.Metrics/Program.cs` | Added PATH_BASE support |
| `services/metrics/StockTracker.Metrics/Dockerfile` | Updated build context |
| `deployment/vm/docker-compose.yml` | Enabled metrics + alloy |
| `deployment/vm/Caddyfile` | Added metrics route |
| `deployment/vm/alloy-config.alloy` | New - Alloy configuration |
| `.github/workflows/deploy-vm.yml` | Added triggers + secrets |

