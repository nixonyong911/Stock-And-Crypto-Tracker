# Azure Container Apps CLI

## List Apps

```powershell
# List all container apps in resource group
az containerapp list --resource-group rg-stocktracker -o table
```

## Logs

```powershell
# View logs (follow mode)
az containerapp logs show --name ca-alphavantage --resource-group rg-stocktracker --follow

# View logs for specific container
az containerapp logs show --name ca-twelvedata --resource-group rg-stocktracker --follow
```

## Health Checks

```powershell
# Check health endpoint
Invoke-WebRequest -Uri "https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live" -UseBasicParsing
```





