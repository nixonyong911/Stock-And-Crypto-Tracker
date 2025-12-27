# VM Migration - Metrics Service - COMPLETED

**Date Completed**: December 27, 2025  
**Original Task**: `instruction/history/azure/2025-12-27-vm-migration-phase2-pending.md`

## Completed Items

### Metrics Service Enablement

- [x] Uncomment `metrics` service in `deployment/vm/docker-compose.yml` - Verified deployed
- [x] Uncomment `/api/metrics*` route in `deployment/vm/Caddyfile` - Verified routing works
- [x] Add trigger path to `deploy-vm.yml`: `services/metrics/**` - Added to workflow
- [x] Add PATH_BASE support to `Program.cs` - Fixed Swagger behind reverse proxy
- [x] Update Dockerfile for new build context - Aligned with TwelveData pattern
- [x] Test deployment - GitHub Actions successful
- [x] Verify Swagger at `/api/metrics/swagger` - Accessible and working

### Grafana Cloud Integration

- [x] Create Grafana Cloud account (free tier)
- [x] Create Access Policy with `metrics:write` scope
- [x] Generate API token for Alloy
- [x] Add `GRAFANA_CLOUD_API_KEY` to Infisical → GitHub Secrets
- [x] Add Grafana Alloy service to `docker-compose.yml`
- [x] Create `deployment/vm/alloy-config.alloy` configuration
- [x] Update `deploy-vm.yml` to write secrets to `.env` file on VM
- [x] Verify metrics flowing to Grafana Cloud - Confirmed `up{job="stocktracker-metrics"}` = 1

## Summary

Enabled the Metrics Service on the Azure VM and integrated Grafana Cloud for centralized monitoring. Metrics are now being scraped by Grafana Alloy and forwarded to Grafana Cloud's hosted Prometheus. This replaces the need for self-hosted Prometheus.

## Files Modified

| File | Change |
|------|--------|
| `deployment/vm/docker-compose.yml` | Uncommented metrics service, added alloy service |
| `deployment/vm/Caddyfile` | Uncommented /api/metrics route |
| `deployment/vm/alloy-config.alloy` | New file - Alloy configuration |
| `.github/workflows/deploy-vm.yml` | Added metrics build, alloy config sync, GRAFANA_CLOUD_API_KEY |
| `services/metrics/StockTracker.Metrics/Program.cs` | Added PATH_BASE support |
| `services/metrics/StockTracker.Metrics/Dockerfile` | Updated build context |

## Service URLs

| Service | URL |
|---------|-----|
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger |
| Metrics Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live |
| Grafana Cloud | https://stockandcryptotracker.grafana.net/ |

## Related Documents

- [Remaining Phase 2 Tasks](../../history/azure/2025-12-27-vm-migration-phase2-pending.md)
- [Phase 2 TODO](../../todo/phase-2-vm-services.md)
- [Metrics Setup Notes](../../unfiltered/2025-12-27-metrics-grafana-cloud-setup.md)
- [Worker Metrics Guide](../../unfiltered/2025-12-27-worker-metrics-implementation-guide.md)

