# Azure Container Apps Deployment

> ⚠️ **DEPRECATED**: This document is kept for historical reference only.
> 
> **As of December 27, 2025**, all backend services have been migrated from Azure Container Apps to an Azure VM.
> 
> See: [VM Deployment Architecture](vm-deployment-architecture.md)

---

## Historical Information

This document previously described the Azure Container Apps deployment setup used before the VM migration.

### What Was Deployed

- `ca-twelvedata` - TwelveData stock data worker
- `ca-alphavantage` - AlphaVantage worker (retired)
- `ca-metrics` - Metrics aggregation service
- `cae-stocktracker` - Container Apps Environment

### Why Migrated

1. **0-Replica Problem**: Container Apps scaled to 0 when no HTTP traffic, preventing scheduled jobs
2. **Cost**: Paying for Container Apps Environment even when services weren't running
3. **Limited Customization**: Less control over networking and debugging

### Migration Reference

For details on the migration process, see:
- [Full Migration History](../history/azure/2025-12-27-full-vm-migration-from-container-apps.md)
- [New VM Architecture](vm-deployment-architecture.md)

### Deleted Azure Resources

| Resource | Type | Deleted Date |
|----------|------|--------------|
| `ca-twelvedata` | Container App | Dec 27, 2025 |
| `ca-alphavantage` | Container App | Dec 27, 2025 |
| `ca-metrics` | Container App | Dec 27, 2025 |
| `cae-stocktracker` | Container Apps Environment | Dec 27, 2025 |
