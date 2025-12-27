# Azure Container Apps CLI (ARCHIVED)

> **DEPRECATED**: This document is archived for historical reference only.
> 
> As of December 27, 2025, all backend services have been migrated from Azure Container Apps to an Azure VM.
> 
> See: [VM Deployment Architecture](../../../architecture/vm-deployment-architecture.md)

---

## Historical Commands (No Longer Applicable)

### List Apps

```powershell
# List all container apps in resource group
az containerapp list --resource-group rg-stocktracker -o table
```

### Logs

```powershell
# View logs (follow mode)
az containerapp logs show --name ca-alphavantage --resource-group rg-stocktracker --follow

# View logs for specific container
az containerapp logs show --name ca-twelvedata --resource-group rg-stocktracker --follow
```

### Health Checks

```powershell
# Check health endpoint
Invoke-WebRequest -Uri "https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live" -UseBasicParsing
```

