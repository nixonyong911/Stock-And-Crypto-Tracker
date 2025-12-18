# Azure Container Apps Deployment Guide

## Overview

This document describes the CI/CD pipeline for deploying backend services to Azure Container Apps. The frontend is hosted separately on Vercel.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   GitHub Repository                                                  │
│         │                                                            │
│         │ git push to main                                           │
│         ▼                                                            │
│   GitHub Actions (.github/workflows/deploy-azure.yml)                │
│         │                                                            │
│         ├─► Build Docker images                                      │
│         ├─► Push to Azure Container Registry (ACR)                   │
│         └─► Deploy to Azure Container Apps                           │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                         HOSTING                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Frontend (Next.js)     → Vercel (auto-deploy from GitHub)          │
│   Backend Workers (.NET) → Azure Container Apps                      │
│   Database               → Supabase (PostgreSQL)                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Azure Resources

| Resource | Name | Type | Purpose |
|----------|------|------|---------|
| Resource Group | `rg-stocktracker` | Resource Group | Container for all resources |
| Container Registry | `acrstocktracker911` | ACR | Stores Docker images |
| Container Apps Environment | `cae-stocktracker` | Environment | Shared environment for apps |
| Container App | `ca-alphavantage` | Container App | AlphaVantage data fetcher worker |
| Container App | `ca-metrics` | Container App | Metrics aggregation service |

### Resource Details

```
Region              : southeastasia
Subscription        : Visual Studio Professional Subscription
Subscription ID     : 5fdc2a22-ece0-44ae-a83b-95cd0a63838c
Tenant ID           : d2d302fb-0aef-4773-94a5-7950c6f64a35
```

### Container Registry

```
Name                : acrstocktracker911
Login Server        : acrstocktracker911.azurecr.io
Username            : acrstocktracker911
```

### Container Apps URLs

```
AlphaVantage Worker : https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io
Metrics Service     : Internal (ca-metrics.internal)
```

## GitHub Actions Workflow

### File Location
```
.github/workflows/deploy-azure.yml
```

### Trigger Conditions
- Push to `main` branch
- Changes in:
  - `services/data-fetchers/**`
  - `services/metrics/**`
  - `services/common/**`
- Excludes: `services/frontend/**` (handled by Vercel)
- Manual trigger via `workflow_dispatch`

### Workflow Steps
1. Checkout repository
2. Login to Azure (using service principal)
3. Login to Azure Container Registry
4. Build and push Metrics Service Docker image
5. Build and push AlphaVantage Worker Docker image
6. Deploy Metrics Service to Container Apps
7. Deploy AlphaVantage Worker to Container Apps

## GitHub Secrets Required

### Azure Infrastructure Secrets

| Secret Name | Description |
|-------------|-------------|
| `AZURE_CREDENTIALS` | Service principal JSON for Azure authentication |
| `ACR_LOGIN_SERVER` | `acrstocktracker911.azurecr.io` |
| `ACR_USERNAME` | `acrstocktracker911` |
| `ACR_PASSWORD` | ACR admin password |

### Application Secrets

| Secret Name | Description |
|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon/publishable key |
| `SUPABASE_SECRET_DEFAULT_KEY` | Supabase service role key |
| `DATABASE_CONNECTION_STRING` | ADO.NET connection string for .NET services |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key |

### AZURE_CREDENTIALS Format

```json
{
  "clientId": "<service-principal-app-id>",
  "clientSecret": "<service-principal-password>",
  "subscriptionId": "5fdc2a22-ece0-44ae-a83b-95cd0a63838c",
  "tenantId": "d2d302fb-0aef-4773-94a5-7950c6f64a35"
}
```

## Environment Variables (Container Apps)

### AlphaVantage Worker

| Variable | Value/Source |
|----------|--------------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `Supabase__Url` | From `NEXT_PUBLIC_SUPABASE_URL` secret |
| `Supabase__AnonKey` | From `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` secret |
| `Supabase__ServiceRoleKey` | From `SUPABASE_SECRET_DEFAULT_KEY` secret |
| `ConnectionStrings__DefaultConnection` | From `DATABASE_CONNECTION_STRING` secret |
| `AlphaVantage__ApiKey` | From `ALPHA_VANTAGE_API_KEY` secret |
| `AlphaVantage__BaseUrl` | `https://www.alphavantage.co` |
| `AlphaVantage__FetchIntervalMinutes` | `60` |
| `AlphaVantage__Symbols` | `AAPL,GOOGL,MSFT,AMZN,TSLA` |
| `MetricsService__BaseUrl` | `https://ca-metrics.internal` |
| `MetricsService__WorkerName` | `alphavantage` |
| `MetricsService__Enabled` | `true` |

### Metrics Service

| Variable | Value |
|----------|-------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |

## CLI Commands Reference

### Azure Login
```powershell
az login
```

### List Container Apps
```powershell
az containerapp list --resource-group rg-stocktracker -o table
```

### Check Container App Status
```powershell
az containerapp show --name ca-alphavantage --resource-group rg-stocktracker --query "{Name:name, Status:properties.runningStatus, URL:properties.configuration.ingress.fqdn}" -o table
```

### View Container App Logs
```powershell
az containerapp logs show --name ca-alphavantage --resource-group rg-stocktracker --follow
```

### Restart Container App
```powershell
az containerapp revision restart --name ca-alphavantage --resource-group rg-stocktracker --revision <revision-name>
```

### Update Environment Variables
```powershell
az containerapp update --name ca-alphavantage --resource-group rg-stocktracker --set-env-vars "KEY=VALUE"
```

### Check ACR Images
```powershell
az acr repository list --name acrstocktracker911 -o table
az acr repository show-tags --name acrstocktracker911 --repository alphavantage-worker -o table
```

## Verification Steps

### 1. Test Health Endpoint
```powershell
# AlphaVantage Worker
Invoke-WebRequest -Uri "https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live" -UseBasicParsing

# Expected: StatusCode 200
```

### 2. Check Azure Portal
1. Go to https://portal.azure.com
2. Search for "rg-stocktracker"
3. Verify both container apps show "Running" status

### 3. Check GitHub Actions
1. Go to https://github.com/nixonyong911/Stock-And-Crypto-Tracker/actions
2. Verify latest workflow run has green checkmark

## Troubleshooting

### Workflow Fails to Push (OAuth Scope)
**Error**: `refusing to allow an OAuth App to create or update workflow without 'workflow' scope`

**Solution**: Use GitHub CLI to authenticate
```powershell
gh auth login
# Select: GitHub.com → HTTPS → Login with web browser
```

### Container App Not Starting
1. Check logs in Azure Portal: Container App → Log stream
2. Verify environment variables are set correctly
3. Check if ACR image exists and is accessible

### Service Principal Expired
Regenerate credentials:
```powershell
az ad sp credential reset --id <client-id>
```
Then update `AZURE_CREDENTIALS` GitHub secret.

## Manual Deployment (Emergency)

If GitHub Actions fails, deploy manually:

```powershell
# Login to Azure
az login

# Login to ACR
az acr login --name acrstocktracker911

# Build and push image
docker build -f services/data-fetchers/AlphaVantage/Dockerfile -t acrstocktracker911.azurecr.io/alphavantage-worker:manual services/
docker push acrstocktracker911.azurecr.io/alphavantage-worker:manual

# Update container app
az containerapp update --name ca-alphavantage --resource-group rg-stocktracker --image acrstocktracker911.azurecr.io/alphavantage-worker:manual
```

## Related Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-azure.yml` | GitHub Actions workflow |
| `services/data-fetchers/AlphaVantage/Dockerfile` | AlphaVantage Docker build |
| `services/metrics/StockTracker.Metrics/Dockerfile` | Metrics Service Docker build |
| `docker-compose.yml` | Local development (backend removed for Vercel) |











