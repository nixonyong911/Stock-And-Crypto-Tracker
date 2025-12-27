# Phase 2: VM Services TODO

**Created**: December 27, 2025  
**Status**: Partially Complete

## Overview

Phase 1 deployed core services (Caddy, n8n, TwelveData) to the Azure VM. Phase 2 enables monitoring and remaining services.

---

## Completed Items

### 1. Metrics Service - DONE
- [x] Uncomment `metrics` service in `deployment/vm/docker-compose.yml`
- [x] Uncomment `/api/metrics*` route in `deployment/vm/Caddyfile`
- [x] Add `deploy-vm.yml` path trigger: `services/metrics/**`
- [x] Add PATH_BASE support to Program.cs
- [x] Update Dockerfile for new build context
- [x] Push changes and verify deployment
- [x] Test Swagger UI at `/api/metrics/swagger`

### 2. Grafana Cloud Integration - DONE
- [x] Create Grafana Cloud account (free tier)
- [x] Create Access Policy with `metrics:write` scope
- [x] Generate API token for Alloy
- [x] Add `GRAFANA_CLOUD_API_KEY` to Infisical/GitHub Secrets
- [x] Add Grafana Alloy service to docker-compose.yml
- [x] Create `alloy-config.alloy` configuration
- [x] Update deploy-vm.yml to write secrets to .env file
- [x] Verify metrics flowing to Grafana Cloud

**Documentation**: 
- [Metrics Setup Notes](../unfiltered/2025-12-27-metrics-grafana-cloud-setup.md)
- [Worker Metrics Guide](../unfiltered/2025-12-27-worker-metrics-implementation-guide.md)

---

## Pending Items

### 3. Enable AI-Hub Service

Prerequisites needed:
- [ ] Create Google Cloud project for Gemini API
- [ ] Generate `AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH`
- [ ] Get `GOOGLE_CLOUD_PROJECT_ID`
- [ ] Add secrets to Infisical (will auto-sync to GitHub)

Deployment:
- [ ] Uncomment `ai-hub` service in `deployment/vm/docker-compose.yml`
- [ ] Uncomment `/api/ai-hub*` route in `deployment/vm/Caddyfile`
- [ ] Add secrets to `deploy-vm.yml` env section
- [ ] Add `deploy-vm.yml` path trigger: `services/ai/**`
- [ ] Push changes and verify deployment
- [ ] Test Docs at `/api/ai-hub/docs`

---

## Enhancement TODOs

### Worker Metrics Implementation (High Priority)
- [ ] Add `IMetricsClient` to TwelveData worker
- [ ] Implement critical metrics:
  - [ ] `fetch_operations_total` (count with status label)
  - [ ] `fetch_duration_seconds` (histogram)
  - [ ] `fetch_errors_total` (count by error type)
  - [ ] `worker_heartbeat_timestamp` (gauge)
  - [ ] `records_inserted_total` (count)
- [ ] Test metrics appear in Grafana Cloud

### Grafana Cloud Dashboards (Medium Priority)
- [ ] Create worker health dashboard
- [ ] Create API fetch success/failure dashboard
- [ ] Create error rate trend dashboard

### Alerting (Medium Priority)
- [ ] Set up alert for Metrics Service down
- [ ] Set up alert for high error rate (>10%)
- [ ] Set up alert for no data received (worker stopped)
- [ ] Configure notification channel (email/Slack)

### Cleanup (Low Priority)
- [ ] Remove `monitoring/prometheus.yml` file
- [ ] Remove `monitoring/` folder
- [ ] Remove commented Prometheus sections from `docker-compose.yml`
- [ ] Update documentation to remove Prometheus references

---

## Quick Reference

### Service URLs

| Service | URL |
|---------|-----|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger |
| Grafana Cloud | https://stockandcryptotracker.grafana.net/ |

### SSH Commands

```bash
# SSH to VM
ssh-azure

# Check running services
docker ps

# View logs
docker logs <service-name>

# Restart service
docker compose restart <service-name>
```

---

## Related Documents

- [Metrics Setup Notes](../unfiltered/2025-12-27-metrics-grafana-cloud-setup.md)
- [Worker Metrics Guide](../unfiltered/2025-12-27-worker-metrics-implementation-guide.md)
- [VM Architecture](../architecture/vm-deployment-architecture.md)
- [Worker Endpoints](../cli/caddy/worker-endpoints.md)
