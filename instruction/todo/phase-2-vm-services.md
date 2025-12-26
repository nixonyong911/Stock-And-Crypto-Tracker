# Phase 2: VM Services TODO

**Created**: December 27, 2025  
**Status**: Pending

## Overview

Phase 1 deployed core services (Caddy, n8n, TwelveData) to the Azure VM. Phase 2 will enable the remaining services.

---

## TODO Items

### 1. Enable Metrics Service

- [ ] Uncomment `metrics` service in `deployment/vm/docker-compose.yml`
- [ ] Uncomment `/api/metrics*` route in `deployment/vm/Caddyfile`
- [ ] Add `deploy-vm.yml` path trigger: `services/metrics/**`
- [ ] Push changes and verify deployment
- [ ] Test Swagger UI at `/api/metrics/swagger`

**No API keys needed** - just enable and deploy.

---

### 2. Enable AI-Hub Service

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

### 3. Optional Improvements

- [ ] Add CaddyManager GUI (find working Docker image or self-host)
- [ ] Set up Prometheus metrics collection
- [ ] Add alerting for service failures
- [ ] Set up log aggregation (Loki/Grafana)

---

## Quick Reference

### Files to Edit

| Task | File |
|------|------|
| Enable service | `deployment/vm/docker-compose.yml` |
| Add route | `deployment/vm/Caddyfile` |
| Add secrets | `deployment/vm/deploy-vm.yml` |
| Add trigger path | `.github/workflows/deploy-vm.yml` |

### Commands

```bash
# SSH to VM
ssh-azure

# Check running services
docker ps

# View logs
docker logs <service-name>

# Restart service
docker compose restart <service-name>

# Rebuild and deploy
docker compose up -d --build <service-name>
```

---

## Related Documents

- [Migration History](../history/azure/2025-12-27-full-vm-migration-from-container-apps.md)
- [VM Architecture](../architecture/vm-deployment-architecture.md)
- [Worker Endpoints](../cli/caddy/worker-endpoints.md)

