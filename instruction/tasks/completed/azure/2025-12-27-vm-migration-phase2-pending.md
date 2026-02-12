# VM Migration Phase 2 - PENDING

**Date**: December 27, 2025  
**Status**: 🟡 PENDING - Metrics Complete, gateway-2.0 & Others Pending

> **Metrics Service Completed**: See `instruction/completed/azure/2025-12-27-vm-migration-metrics-complete.md`  
> **Phase 1 Completed**: See `instruction/completed/azure/2025-12-27-vm-migration-phase1-complete.md`

## Remaining Tasks

### 1. gateway-2.0 (AI Gateway)

**Status**: ⏸️ Disabled, needs API keys

**Prerequisites**:
- [ ] Create Google Cloud project
- [ ] Generate Gemini API key (`AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH`)
- [ ] Get `GOOGLE_CLOUD_PROJECT_ID`
- [ ] Add secrets to Infisical

**Deployment**:
- [ ] Enable `gateway-2.0` service in `deployment/vm/docker-compose.yml`
- [ ] Ensure Caddy routes for gateway-2.0 are configured
- [ ] Add secrets to `deploy-vm.yml` env section
- [ ] Add trigger path: `services/ai/**`
- [ ] Test deployment
- [ ] Verify docs at gateway-2.0 health/API endpoints

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

### Enable gateway-2.0 (AI Gateway)

```bash
# After adding API keys to Infisical/GitHub:
# 1. Edit docker-compose.yml - ensure gateway-2.0 service is enabled
# 2. Edit Caddyfile - ensure gateway-2.0 routes are configured
# 3. Update deploy-vm.yml with new secrets
# 4. Push changes - GitHub Actions will deploy
```

## Related Documents

- [Metrics Complete](../../completed/azure/2025-12-27-vm-migration-metrics-complete.md)
- [Phase 1 Complete](../../completed/azure/2025-12-27-vm-migration-phase1-complete.md)
- [Phase 2 TODO](../../todo/phase-2-vm-services.md)
- [VM Architecture](../../architecture/vm-deployment-architecture.md)
