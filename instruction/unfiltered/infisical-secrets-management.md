# Infisical Secrets Management

> **Placement**: This document should be placed in `instruction/architecture/infisical-secrets-management.md`

---

## Overview

Infisical Cloud is the **single source of truth** for all secrets in this project. Secrets auto-sync to GitHub Actions and Vercel.

```
Infisical Cloud ──► Auto-sync ──► GitHub Secrets (for Azure deployments)
               ──► Auto-sync ──► Vercel (for frontend env vars)
               ──► CLI inject ──► Local development (docker-compose)
```

---

## Architecture

| Component | Role |
|-----------|------|
| **Infisical Cloud** | Central secrets storage |
| **GitHub Integration** | Auto-syncs secrets to repository secrets |
| **Vercel Integration** | Auto-syncs `NEXT_PUBLIC_*` secrets to Vercel |
| **Infisical CLI** | Injects secrets for local development |

---

## Secrets Inventory

### Application Secrets

| Secret | Synced To | Used By |
|--------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub, Vercel | All services |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | GitHub, Vercel | Frontend, Backend |
| `SUPABASE_SECRET_DEFAULT_KEY` | GitHub | Backend workers |
| `DATABASE_CONNECTION_STRING` | GitHub | Backend workers |
| `TWELVE_DATA_API_KEY` | GitHub | TwelveData worker |

### Infrastructure Secrets

| Secret | Synced To | Used By |
|--------|-----------|---------|
| `AZURE_CREDENTIALS` | GitHub | GitHub Actions (Azure login) |
| `ACR_LOGIN_SERVER` | GitHub | GitHub Actions (Docker push) |
| `ACR_USERNAME` | GitHub | GitHub Actions (Docker push) |
| `ACR_PASSWORD` | GitHub | GitHub Actions (Docker push) |

---

## Infisical Project Structure

| Environment | Purpose |
|-------------|---------|
| **Production** | Live deployment secrets |
| **Staging** | Staging/test environment |
| **Development** | Local development |

---

## Integrations

### GitHub Sync

| Setting | Value |
|---------|-------|
| **Name** | `github-sync` |
| **Source** | Production environment |
| **Destination** | `nixonyong911/Stock-And-Crypto-Tracker` repository |
| **Scope** | Repository secrets |
| **Auto-Sync** | Enabled |
| **Secret Deletion** | Disabled (safe mode) |

### Vercel Sync

| Setting | Value |
|---------|-------|
| **Name** | `infisical-stock-and-crypto` |
| **Source** | Production environment |
| **Destination** | `stock-and-crypto-tracker` Vercel project |
| **Secrets** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| **Auto-Sync** | Enabled |

---

## Local Development

### Prerequisites

- Infisical CLI installed (`scoop install infisical` or `winget install Infisical.Infisical`)
- Logged in (`infisical login`)
- Project initialized (`.infisical.json` exists)

### Commands

```powershell
# View secrets (masked)
infisical secrets --env=prod

# Run docker-compose with injected secrets
infisical run --env=prod -- docker-compose up -d

# Run any command with secrets
infisical run --env=prod -- dotnet run
```

### Configuration File

`.infisical.json` (committed to repo - safe, contains no secrets):

```json
{
    "workspaceId": "298001ad-cff0-43e5-9269-059d5a94db6f",
    "defaultEnvironment": "",
    "gitBranchToEnvironmentMapping": null
}
```

---

## Adding New Secrets

1. **Add to Infisical** → Project → Production environment → Add Secret
2. **Copy to other environments** if needed (Staging, Development)
3. **Wait for auto-sync** → GitHub/Vercel will update automatically
4. **Update workflow** if secret needs to be passed to Azure Container Apps

### Example: Adding a New API Key

```
1. Infisical Dashboard → Add Secret:
   Name: NEW_API_KEY
   Value: xxx

2. If needed in Azure deployment, update deploy-azure.yml:
   environmentVariables: |
     NewService__ApiKey=${{ secrets.NEW_API_KEY }}
```

---

## Troubleshooting

### Secrets Not Syncing

1. Check Infisical Dashboard → Integrations → Status should show "Synced"
2. Manually trigger sync: Click integration → "Sync Now"
3. Verify GitHub/Vercel has the updated secret

### GitHub Actions Failing

1. Check if secret exists in GitHub: Settings → Secrets → Actions
2. Verify secret name matches exactly (case-sensitive)
3. Check Infisical integration logs for sync errors

### Local Development Issues

```powershell
# Re-login if token expired
infisical login

# Verify secrets are accessible
infisical secrets --env=prod

# Check .infisical.json exists and has correct workspaceId
```

---

## Migration Notes

### Previous Setup (Deprecated)

```
.env.staging (local) → Manual copy → GitHub Secrets
                    → Manual copy → Vercel Dashboard
```

### Current Setup

```
Infisical Cloud → Auto-sync → GitHub Secrets
               → Auto-sync → Vercel
               → CLI inject → Local development
```

### Backup

- Original `.env.staging` file kept as local backup (gitignored)
- Original GitHub Secrets retained with "Disable Secret Deletion" enabled
- Can revert to manual workflow if needed

---

## Related Documentation

- [Infrastructure Reference](infrastructure-reference.md) - Azure resources and URLs
- [Azure Deployment](azure-container-apps-deployment.md) - CI/CD workflow details
- [Vercel Deployment](vercel-frontend-deployment.md) - Frontend deployment

