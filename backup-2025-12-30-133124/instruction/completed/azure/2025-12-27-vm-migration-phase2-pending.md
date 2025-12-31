# VM Migration Phase 2 - PENDING

**Date**: December 27, 2025  
**Status**: 🟡 PENDING - Metrics Complete, AI-Hub & Others Pending

> **Metrics Service Completed**: See `instruction/completed/azure/2025-12-27-vm-migration-metrics-complete.md`  
> **Phase 1 Completed**: See `instruction/completed/azure/2025-12-27-vm-migration-phase1-complete.md`

## Remaining Tasks

### 1. AI-Hub Service

**Status**: ⏸️ Disabled, needs API keys

**Prerequisites**:
- [ ] Create Google Cloud project
- [ ] Generate Gemini API key (`AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH`)
- [ ] Get `GOOGLE_CLOUD_PROJECT_ID`
- [ ] Add secrets to Infisical

**Deployment**:
- [ ] Uncomment `ai-hub` service in `deployment/vm/docker-compose.yml`
- [ ] Uncomment `/api/ai-hub*` route in `deployment/vm/Caddyfile`
- [ ] Add secrets to `deploy-vm.yml` env section
- [ ] Add trigger path: `services/ai/**`
- [ ] Test deployment
- [ ] Verify docs at `/api/ai-hub/docs`

---

### 2. Infisical CLI on VM

**Status**: ❌ Not implemented (simplified with .env file)

**See**: `instruction/history/Infisical/vm-infisical-integration.md`

**Why Important**:
- Currently using `.env` file on VM (written by GitHub Actions)
- Should use Infisical CLI for centralized secret management
- Better security and audit trail

**Priority**: Medium - Current approach works but less secure

---

### 3. CaddyManager GUI

**Status**: ❌ Not implemented (Docker image access denied)

**See**: `instruction/history/caddy/caddymanager-gui-setup.md`

**Priority**: Low - CLI works fine

---

## Quick Reference

### Enable AI-Hub Service

```bash
# After adding API keys to Infisical/GitHub:
# 1. Edit docker-compose.yml - uncomment ai-hub service
# 2. Edit Caddyfile - uncomment /api/ai-hub* route
# 3. Update deploy-vm.yml with new secrets
# 4. Push changes - GitHub Actions will deploy
```

## Related Documents

- [Metrics Complete](../../completed/azure/2025-12-27-vm-migration-metrics-complete.md)
- [Phase 1 Complete](../../completed/azure/2025-12-27-vm-migration-phase1-complete.md)
- [Phase 2 TODO](../../todo/phase-2-vm-services.md)
- [VM Architecture](../../architecture/vm-deployment-architecture.md)
