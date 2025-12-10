# Instruction Documentation

This folder contains deployment and infrastructure documentation for the Stock and Crypto Tracker project.

## Documents

| Document | Description |
|----------|-------------|
| [infrastructure-reference.md](infrastructure-reference.md) | Quick reference for all resources, credentials, and URLs |
| [azure-container-apps-deployment.md](azure-container-apps-deployment.md) | Complete guide for Azure Container Apps deployment |
| [vercel-frontend-deployment.md](vercel-frontend-deployment.md) | Guide for Vercel frontend deployment |

## Quick Start

### Deploy Backend (Azure)
1. Make changes to `services/data-fetchers/`, `services/metrics/`, or `services/common/`
2. Commit and push to `main` branch
3. GitHub Actions automatically deploys to Azure Container Apps

### Deploy Frontend (Vercel)
1. Make changes to `services/frontend/`
2. Commit and push to `main` branch
3. Vercel automatically deploys

### Verify Deployment
```powershell
# Check Azure Container Apps
az containerapp list --resource-group rg-stocktracker -o table

# Test health endpoint
Invoke-WebRequest -Uri "https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live" -UseBasicParsing
```

## Architecture Summary

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    Vercel      │     │  Azure (ACA)   │     │   Supabase     │
│   (Frontend)   │     │   (Backend)    │     │  (Database)    │
├────────────────┤     ├────────────────┤     ├────────────────┤
│  Next.js App   │────▶│ AlphaVantage   │────▶│  PostgreSQL    │
│                │     │ Metrics        │     │                │
└────────────────┘     └────────────────┘     └────────────────┘
       │                                              ▲
       └──────────────────────────────────────────────┘
                    (Supabase Client)
```

