# VM Migration Phase 2 - PENDING

**Date**: December 27, 2025  
**Status**: 🟡 PENDING - Phase 1 Complete, Phase 2 Not Started

> **Phase 1 Completed**: See `instruction/completed/azure/2025-12-27-vm-migration-phase1-complete.md`

## Remaining Tasks

### 1. Metrics Service

**Status**: ⏸️ Disabled in docker-compose.yml

**TODO**:
- [ ] Uncomment `metrics` service in `deployment/vm/docker-compose.yml`
- [ ] Uncomment `/api/metrics*` route in `deployment/vm/Caddyfile`
- [ ] Add trigger path to `deploy-vm.yml`: `services/metrics/**`
- [ ] Test deployment
- [ ] Verify Swagger at `/api/metrics/swagger`

**No blockers** - Just needs to be enabled and tested.

---

### 2. AI-Hub Service

**Status**: ⏸️ Disabled, needs API keys

**Prerequisites**:
- [ ] Create Google Cloud project
- [ ] Generate Gemini API key (`AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH`)
- [ ] Get `GOOGLE_CLOUD_PROJECT_ID`
- [ ] Add secrets to Infisical

**TODO**:
- [ ] Uncomment `ai-hub` service in `deployment/vm/docker-compose.yml`
- [ ] Uncomment `/api/ai-hub*` route in `deployment/vm/Caddyfile`
- [ ] Add secrets to `deploy-vm.yml` env section
- [ ] Add trigger path: `services/ai/**`
- [ ] Test deployment
- [ ] Verify docs at `/api/ai-hub/docs`

---

### 3. Infisical CLI on VM

**Status**: ❌ Not implemented (simplified with .env file)

**See**: `instruction/history/Infisical/vm-infisical-integration.md`

**Why Important**:
- Currently using `.env` file on VM
- Should use Infisical CLI for centralized secret management
- Better security and audit trail

---

### 4. CaddyManager GUI

**Status**: ❌ Not implemented (Docker image access denied)

**See**: `instruction/history/caddy/caddymanager-gui-setup.md`

**Priority**: Low - CLI works fine

---

## Quick Reference

### Enable Metrics Service

```bash
# 1. Edit docker-compose.yml - uncomment metrics service
# 2. Edit Caddyfile - uncomment /api/metrics* route
# 3. Deploy
ssh azureuser@20.17.176.1
cd /opt/stocktracker
docker compose up -d --build metrics
```

### Enable AI-Hub Service

```bash
# After adding API keys to Infisical/GitHub:
# 1. Edit docker-compose.yml - uncomment ai-hub service
# 2. Edit Caddyfile - uncomment /api/ai-hub* route
# 3. Update deploy-vm.yml with new secrets
# 4. Deploy
```

## Related Documents

- [Phase 1 Completed](../../completed/azure/2025-12-27-vm-migration-phase1-complete.md)
- [Phase 2 TODO](../../todo/phase-2-vm-services.md)
- [VM Architecture](../../architecture/vm-deployment-architecture.md)

