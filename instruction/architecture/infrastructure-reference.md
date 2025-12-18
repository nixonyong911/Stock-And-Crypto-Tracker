# Infrastructure Quick Reference

## Hosting Overview

| Component | Provider | Auto-Deploy |
|-----------|----------|-------------|
| Frontend (Next.js) | Vercel | Yes (git push) |
| Backend Workers (.NET) | Azure Container Apps | Yes (GitHub Actions) |
| Database | Supabase | N/A (managed) |

---

## Azure Resources

```
===========================================
SUBSCRIPTION
===========================================
Subscription ID     : 5fdc2a22-ece0-44ae-a83b-95cd0a63838c
Subscription Name   : Visual Studio Professional Subscription
Tenant ID           : d2d302fb-0aef-4773-94a5-7950c6f64a35

===========================================
RESOURCE GROUP
===========================================
Name                : rg-stocktracker
Location            : southeastasia

===========================================
CONTAINER REGISTRY (ACR)
===========================================
Name                : acrstocktracker911
Login Server        : acrstocktracker911.azurecr.io
Username            : acrstocktracker911

===========================================
CONTAINER APPS ENVIRONMENT
===========================================
Name                : cae-stocktracker
Location            : southeastasia

===========================================
CONTAINER APPS
===========================================
AlphaVantage Worker
- Name              : ca-alphavantage
- Ingress           : External
- URL               : https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io

Metrics Service
- Name              : ca-metrics
- Ingress           : Internal

===========================================
SERVICE PRINCIPAL (GitHub Actions)
===========================================
Name                : github-stocktracker
Client ID           : 4d0c2cec-3b17-45bb-8c25-70204bc9397d
```

---

## GitHub Secrets

```
===========================================
REPOSITORY SECRETS (9 Total)
===========================================
Azure Infrastructure:
├── AZURE_CREDENTIALS
├── ACR_LOGIN_SERVER
├── ACR_USERNAME
└── ACR_PASSWORD

Application:
├── NEXT_PUBLIC_SUPABASE_URL
├── NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
├── SUPABASE_SECRET_DEFAULT_KEY
├── DATABASE_CONNECTION_STRING
└── ALPHA_VANTAGE_API_KEY
```

---

## URLs

| Service | URL |
|---------|-----|
| Frontend (Vercel) | *Configured in Vercel Dashboard* |
| AlphaVantage Worker | https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io |
| Health Check | https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live |
| GitHub Actions | https://github.com/nixonyong911/Stock-And-Crypto-Tracker/actions |
| Azure Portal | https://portal.azure.com |

---

## Quick Commands

### Check Azure Container Apps
```powershell
az containerapp list --resource-group rg-stocktracker -o table
```

### View Logs
```powershell
az containerapp logs show --name ca-alphavantage --resource-group rg-stocktracker --follow
```

### Test Health Endpoint
```powershell
Invoke-WebRequest -Uri "https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live" -UseBasicParsing
```

### Manual Deploy Trigger
```powershell
# Trigger GitHub Actions manually
gh workflow run "Deploy to Azure Container Apps"
```

---

## File Structure

```
.github/
└── workflows/
    └── deploy-azure.yml          # GitHub Actions for Azure deployment

instruction/
├── README.md                     # Main documentation index
├── database/
│   └── README.md                 # Database documentation
└── architecture/
    ├── README.md                 # Architecture documentation index
    ├── overview.md               # Overall system architecture
    ├── azure-container-apps-deployment.md
    ├── vercel-frontend-deployment.md
    └── infrastructure-reference.md  # This file

services/
├── frontend/                     # Next.js (Vercel)
├── data-fetchers/
│   └── AlphaVantage/            # .NET Worker (Azure)
├── metrics/
│   └── StockTracker.Metrics/    # .NET Service (Azure)
└── common/                       # Shared .NET library
```












