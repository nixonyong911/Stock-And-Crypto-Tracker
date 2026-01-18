---
name: credentials-connections
description: Authentication and connection patterns for Stock Tracker infrastructure. Use this skill when connecting to Azure VM via SSH, setting up Infisical secrets, configuring Grafana service account tokens, working with Oracle Cloud OCI credentials, or troubleshooting authentication issues. Triggers on "connect to vm", "ssh to server", "ssh-azure", "pem key", "grafana token", "glsa token", "infisical login", "secrets setup", "machine identity", "oracle oci config", "oci setup", "authentication failed", "permission denied", "connection refused", "credential", "api key setup", "service account". This skill covers HOW to connect and authenticate - for operational commands after connecting, use devops-tools skill instead.
---

# Credentials & Connections

## Table of Contents
- [Critical Gotchas](#critical-gotchas-read-first)
- [SSH Connection](#ssh-connection)
- [Infisical Secrets](#infisical-secrets)
- [Service Account Tokens](#service-account-tokens)
- [Credential Storage Locations](#credential-storage-locations)
- [References](#references)

---

## CRITICAL GOTCHAS (Read First!)

1. **SSH Key Filename Has Spaces**: `nx-linux-server-azure_key (1).pem`
   - Windows: `"$HOME\.ssh\nx-linux-server-azure_key (1).pem"` (double quotes required!)
   - Linux/Mac: `~/.ssh/nx-linux-server-azure_key\ \(1\).pem` (escaped parentheses)
   - **NEVER** rename the key file - GitHub Secrets uses this exact name

2. **Grafana Token Type Matters**:
   - ✅ CORRECT: `glsa_*` (service account token)
   - ❌ WRONG: `glc_*` (cloud policy token - will fail with 401 Unauthorized)
   - Create at: https://stockandcryptotracker.grafana.net/org/serviceaccounts

3. **Infisical Environment**: Always use `--env=prod` (NOT "production" or "development")

4. **All Credentials in Infisical**: Never hardcode secrets. Store all credentials in Infisical.

> **Infrastructure Details**: See [infrastructure-config.md](../../reference/infrastructure-config.md) for IPs, URLs, and service configuration.

---

## SSH Connection

### Quick Connect

```powershell
# PowerShell function (if configured in profile)
ssh-azure

# Direct command (always works)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
```

### Run Remote Command (Non-Interactive)

This is the preferred method for AI agents and automation:

```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "<command>"

# Examples:
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps"
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart twelvedata"
```

### Connection Details

| Property | Value |
|----------|-------|
| **Host** | `20.17.176.1` |
| **FQDN** | `nxserver.malaysiawest.cloudapp.azure.com` |
| **User** | `azureuser` |
| **Key Path** | `$HOME\.ssh\nx-linux-server-azure_key (1).pem` (Windows) |
| **Key Path** | `~/.ssh/nx-linux-server-azure_key\ \(1\).pem` (Linux/Mac) |
| **Region** | Malaysia West |

### Troubleshooting SSH

| Error | Cause | Solution |
|-------|-------|----------|
| Permission denied (publickey) | Key path not quoted correctly | Ensure quotes around path with spaces |
| Connection refused | VM may be restarting | Wait 1-2 minutes and retry |
| Host key verification failed | SSH host key changed | Remove old key: `ssh-keygen -R 20.17.176.1` |
| Bad permissions | Key file too permissive | `chmod 400 ~/.ssh/nx-linux-server-azure_key\ \(1\).pem` |

---

## Infisical Secrets

### Local Development

```powershell
# Login (first time only)
infisical login

# Check current authentication
infisical whoami

# Run with secrets injected
infisical run --env=prod -- docker-compose up -d

# View secrets (masked)
infisical secrets --env=prod

# Export to file (temporary use only - DO NOT COMMIT)
infisical export --env=prod > .env.local
```

### VM Usage (Machine Identity)

On the VM, Infisical uses **Machine Identity** authentication (not user login).

The `./scripts/start-services.sh` wrapper automatically:
1. Authenticates via Machine Identity
2. Fetches secrets from `prod` environment
3. Injects into docker-compose

```powershell
# On VM (secrets auto-inject, no manual login needed)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d"
```

### Decision Tree: Adding New Secrets

```
Need to add a new secret?
│
├── Is it for the frontend (Vercel)?
│   └── YES → Add to Infisical with NEXT_PUBLIC_ prefix
│             → Auto-syncs to Vercel environment variables
│
├── Is it for a backend worker on VM?
│   └── YES → Add to Infisical
│             → Reference in docker-compose.yml environment section
│
└── Is it for local development only?
    └── YES → Add to Infisical
              → Use `infisical run --env=prod` to access it
```

---

## Service Account Tokens

### Grafana (grafanactl)

**Configuration File**:
- Windows: `%LOCALAPPDATA%\grafanactl\config.yaml`
- Linux: `~/.config/grafanactl/config.yaml`

```yaml
contexts:
  stocktracker:
    grafana:
      server: https://stockandcryptotracker.grafana.net
      token: glsa_... # MUST start with glsa_ (service account)
current-context: stocktracker
```

**Create New Service Account Token**:
1. Go to: https://stockandcryptotracker.grafana.net/org/serviceaccounts
2. Create service account with **Admin** role
3. Generate token (starts with `glsa_...`)
4. Store in Infisical as `GRAFANA_SERVICE_ACCOUNT_TOKEN`
5. Add to grafanactl config file

**Verify Configuration**:
```powershell
grafanactl config check
grafanactl config view
```

### Oracle Cloud (OCI CLI)

**Configuration**:
- Location: `~/.oci/config` (all platforms)
- API key: `~/.oci/oci_api_key.pem`

**Resource IDs** (see [service-tokens.md](references/service-tokens.md) for complete list):
- Tenancy: `ocid1.tenancy.oc1..aaaaaaaabmhnjpjmirrqwoecj64wsimmlksoramzhp36i3iyr2sysob4ueeq`
- Region: `ap-singapore-1`

---

## Credential Storage Locations

| Credential | Location | Access Method | Notes |
|------------|----------|---------------|-------|
| **SSH Private Key** | `$HOME\.ssh\nx-linux-server-azure_key (1).pem` | File system | Local machine only |
| **All Secrets** | Infisical Cloud | `infisical` CLI | Source of truth |
| **Grafana Token** | Infisical: `GRAFANA_SERVICE_ACCOUNT_TOKEN` | grafanactl config | Must be `glsa_*` |
| **GitHub PAT** | Infisical: `PAT_GITHUB` | Git clone/push | Private repo access |
| **VM SSH Key** | GitHub Secret: `VM_SSH_PRIVATE_KEY` | GitHub Actions | CI/CD automation |
| **TwelveData API Key** | Infisical: `TWELVE_DATA_API_KEY` | Worker env vars | Stock data fetcher |
| **AI Hub API Key** | Infisical: `AI_HUB_API_KEY` | Service auth | Used by n8n, workers |
| **Supabase URL** | Infisical: `NEXT_PUBLIC_SUPABASE_URL` | Frontend env | Auto-syncs to Vercel |
| **Supabase Key** | Infisical: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Frontend env | Auto-syncs to Vercel |

### Infisical Sync Targets

Infisical automatically syncs to:
- **GitHub Secrets**: For GitHub Actions workflows
- **Vercel**: For frontend environment variables (NEXT_PUBLIC_* only)

---

## References

### Detailed Guides
- [SSH Authentication](references/ssh-authentication.md) - Key setup, PowerShell functions, troubleshooting
- [Infisical Secrets](references/infisical-secrets.md) - Complete workflow, Machine Identity setup
- [Service Tokens](references/service-tokens.md) - Grafana, Oracle OCI, API keys

### Cross-Skill References
- **Need to run commands on VM?** See [devops-tools](../devops-tools/SKILL.md)
- **Infrastructure values?** See [infrastructure-config.md](../../reference/infrastructure-config.md)
