# Infrastructure Quick Reference

## Hosting Overview

| Component | Provider | Auto-Deploy |
|-----------|----------|-------------|
| Frontend (Next.js) | Vercel | Yes (git push) |
| Backend Workers (.NET) | Azure VM | Yes (GitHub Actions → SSH) |
| Database | Supabase | N/A (managed) |

---

## Azure VM Resources

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
Location            : malaysiawest

===========================================
VIRTUAL MACHINE
===========================================
Name                : nx-linux-server-azure
IP Address          : 20.17.176.1
FQDN                : nxserver.malaysiawest.cloudapp.azure.com
User                : azureuser
SSH Key             : ~/.ssh/nx-linux-server-azure_key (1).pem

===========================================
RUNNING SERVICES (Docker)
===========================================
- Caddy (reverse proxy, auto HTTPS)
- n8n (workflow automation)
- TwelveData (stock data fetcher)
- Metrics (Phase 2 - disabled)
- AI-Hub (Phase 2 - disabled)
```

---

## GitHub Secrets

```
===========================================
REPOSITORY SECRETS
===========================================
Application:
├── NEXT_PUBLIC_SUPABASE_URL
├── NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
├── SUPABASE_SECRET_DEFAULT_KEY
├── DATABASE_CONNECTION_STRING
└── TWELVE_DATA_API_KEY

VM Access:
└── VM_SSH_PRIVATE_KEY
```

---

## URLs

| Service | URL |
|---------|-----|
| Frontend (Vercel) | https://stock-tracker.vercel.app/ |
| n8n Dashboard | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| TwelveData Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live |
| GitHub Actions | https://github.com/nixonyong911/Stock-And-Crypto-Tracker/actions |

---

## Quick Commands

### SSH to Azure VM
```powershell
# Using PowerShell alias
ssh-azure

# Or direct SSH
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
```

### Check Running Services
```bash
# On VM
docker ps
docker compose logs -f
```

### Test Health Endpoint
```powershell
Invoke-WebRequest -Uri "https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live" -UseBasicParsing
```

### Manual Deploy Trigger
```powershell
# Trigger GitHub Actions manually
gh workflow run "Deploy to Azure VM"
```

---

## File Structure

```
.github/
└── workflows/
    └── deploy-vm.yml              # GitHub Actions for VM deployment

instruction/
├── README.md                      # Main documentation index
├── database/
│   └── README.md                  # Database documentation
└── architecture/
    ├── README.md                  # Architecture documentation index
    ├── overview.md                # Overall system architecture
    ├── vm-deployment-architecture.md  # Current VM setup
    ├── vercel-frontend-deployment.md
    ├── infisical-secrets-management.md
    └── infrastructure-reference.md    # This file

deployment/
└── vm/
    ├── docker-compose.yml         # VM service definitions
    ├── Caddyfile                  # Reverse proxy config
    └── scripts/                   # Setup scripts

services/
├── frontend/                      # Next.js (Vercel)
├── data-fetchers/
│   └── TwelveData/               # .NET Worker (Azure VM)
├── metrics/
│   └── StockTracker.Metrics/     # .NET Service (Phase 2)
├── ai/
│   └── ai-hub/                   # Python FastAPI (Phase 2)
└── common/                        # Shared .NET library
```

---

## CI/CD Flow

```
Developer pushes to main
         │
         ▼
GitHub Actions (deploy-vm.yml)
         │
         ├── Checkout code
         ├── SSH to VM
         ├── git pull on VM
         ├── Copy deployment configs
         ├── docker compose build
         └── docker compose up -d
         │
         ▼
Azure VM runs services via Docker
```

---

## Secrets Management

All secrets are managed via **Infisical Cloud** and auto-sync to:
- GitHub Secrets (for CI/CD)
- Vercel (for frontend)

See: [infisical-secrets-management.md](infisical-secrets-management.md)
