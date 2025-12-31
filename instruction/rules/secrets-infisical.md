# Secrets & Environment Variables (CRITICAL)

## Source of Truth: Infisical Cloud

All secrets are managed in **Infisical Cloud** and auto-sync to GitHub and Vercel.

Dashboard: https://app.infisical.com → Project: `Stock and Crypto`

## How Variables Flow to Services

```
Infisical Cloud (source of truth)
       │
       ├──► Azure VM (via Infisical CLI + Machine Identity)
       │         Secrets injected at runtime, no .env files
       │         ./scripts/start-services.sh up -d
       │
       ├──► GitHub Secrets (auto-sync via integration)
       │         Used only for VM_SSH_PRIVATE_KEY (CI/CD access)
       │
       ├──► Vercel (auto-sync via integration)
       │         NEXT_PUBLIC_SUPABASE_URL
       │         NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
       │
       └──► Local Development (via Infisical CLI)
                 infisical run --env=prod -- docker-compose up -d
```

## Secrets Inventory

### Application Secrets

| Secret | Synced To | Used By |
|--------|-----------|---------|
| `DATABASE_CONNECTION_STRING` | GitHub | TwelveData, AI-Hub (local) |
| `TWELVE_DATA_API_KEY` | GitHub | TwelveData Worker |
| `AI_HUB_API_KEY` | GitHub | n8n, TwelveData, Metrics, Back-office |
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub, Vercel | Frontend, Back-office |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | GitHub, Vercel | Frontend, Back-office |

### Observability Secrets

| Secret | Synced To | Used By |
|--------|-----------|---------|
| `GRAFANA_CLOUD_API_KEY` | GitHub | Alloy (metrics/logs forwarder) |
| `GRAFANA_CLOUD_LOKI_USER` | GitHub | Alloy (Loki user ID) |

### Infrastructure Secrets

| Secret | Synced To | Used By |
|--------|-----------|---------|
| `VM_SSH_PRIVATE_KEY` | GitHub | CI/CD pipeline (SSH to VM) |
| `PAT_GITHUB` | GitHub | Clone private repo on VM (if repo is private) |

## .NET Configuration Pattern

Environment variables override `appsettings.json` using double-underscore notation:

| Environment Variable | Maps to appsettings.json | Infisical Secret |
|---------------------|--------------------------|------------------|
| `ConnectionStrings__DefaultConnection` | `{ "ConnectionStrings": { "DefaultConnection": "" } }` | `DATABASE_CONNECTION_STRING` |
| `TwelveData__ApiKey` | `{ "TwelveData": { "ApiKey": "" } }` | `TWELVE_DATA_API_KEY` |

**In docker-compose.yml:**
```yaml
environment:
  - ConnectionStrings__DefaultConnection=${DATABASE_CONNECTION_STRING}
  - TwelveData__ApiKey=${TWELVE_DATA_API_KEY}
```

## Adding New Secrets for VM Services

When a worker or service needs a new secret:

**Step 1: Add secret to Infisical Cloud**
- Go to https://app.infisical.com → Project: `Stock and Crypto`
- Add the secret in the `prod` environment (NOT "production")

**Step 2: Reference in docker-compose.yml**
```yaml
# File: deployment/vm/docker-compose.yml
services:
  your-service:
    environment:
      - YOUR_SECRET_NAME=${YOUR_SECRET_NAME}
```

**Step 3: Deploy**
- Push to main (triggers CI/CD), OR
- SSH to VM: `./scripts/start-services.sh up -d`

**Important**: No changes to `deploy-vm.yml` needed! Machine Identity handles auth automatically.

**Example** - Adding a new API key called `ALPHA_VANTAGE_API_KEY`:
1. Add `ALPHA_VANTAGE_API_KEY` to Infisical (`prod` env)
2. In docker-compose.yml: `- ALPHA_VANTAGE_API_KEY=${ALPHA_VANTAGE_API_KEY}`
3. Push to main → Done!

