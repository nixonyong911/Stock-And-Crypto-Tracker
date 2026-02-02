# Infisical Secrets Management

Complete guide to managing secrets with Infisical for Stock Tracker project.

---

## Overview

Infisical CLI commands for running services with secrets injected and managing secrets locally.

**Key principle**: All secrets stored in Infisical Cloud. Never commit secrets to Git.

---

## Decision Tree: Adding New Secrets

```
Adding a new secret?
│
├── Is it for the frontend (Vercel)?
│   └── YES → Add to Infisical with NEXT_PUBLIC_ prefix
│             → Auto-syncs to Vercel environment variables
│             → Example: NEXT_PUBLIC_SUPABASE_URL
│
├── Is it for a backend worker on VM?
│   └── YES → Add to Infisical (no prefix)
│             → Reference in docker-compose.yml environment section
│             → Example: TWELVE_DATA_API_KEY, AI_HUB_API_KEY
│
└── Is it for local development only?
    └── YES → Add to Infisical
              → Use `infisical run --env=prod` to access it
              → Example: DATABASE_CONNECTION_STRING (for local testing)
```

---

## Project Configuration

### Environment

- **Default environment**: `prod`
- **All commands use**: `--env=prod`

### Workspace Configuration

The `.infisical.json` file (safe to commit):

```json
{
  "workspaceId": "your-workspace-id",
  "defaultEnvironment": "prod"
}
```

**Location**: Project root directory

---

## Local Development

### Authentication

```powershell
# Login (first time)
infisical login

# Check current authentication
infisical whoami

# Logout
infisical logout
```

### Run Services with Secrets

```powershell
# Build and start all services with secrets injected
infisical run --env=prod -- docker-compose up -d --build

# Start without rebuild
infisical run --env=prod -- docker-compose up -d

# Run single command with secrets
infisical run --env=prod -- dotnet run

# Run with specific service
infisical run --env=prod -- docker-compose up -d twelvedata
```

### View Secrets

```powershell
# List all secrets (masked)
infisical secrets --env=prod

# Export secrets to file (TEMPORARY USE ONLY - DO NOT COMMIT)
infisical export --env=prod > .env.local

# Delete temp file when done
Remove-Item .env.local
```

**Warning**: Exported `.env.local` files should NEVER be committed to Git.

---

## Dev Container Usage (Service Token)

Dev containers don't have access to the system keyring (no D-Bus), so `infisical login` credentials from the host machine won't work. Use a **Service Token** instead.

### Why It's Different

| Environment | Authentication Method | Storage |
|-------------|----------------------|---------|
| Local PC | `infisical login` | System keyring |
| Dev Container | Service Token | Environment variable |
| VM | Machine Identity | Token on VM |

### Setup Steps

#### Step 1: Create a Service Token

1. Go to https://app.infisical.com
2. Navigate to **Project Access Control** → **Service Tokens**
3. Click **Create Token**
4. Configure:
   - Name: `devcontainer-token`
   - Environment: `dev` (or `prod`)
   - Path: `/`
5. Copy the generated token (starts with `st.`)

#### Step 2: Set Token on Local Machine

**Windows (PowerShell as Admin):**
```powershell
# Set permanently for current user
[Environment]::SetEnvironmentVariable("INFISICAL_TOKEN", "st.xxxxx...", "User")
```

**macOS/Linux:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export INFISICAL_TOKEN="st.xxxxx..."
```

#### Step 3: Configure Dev Container

The `devcontainer.json` passes the token from host to container:

```json
"containerEnv": {
  "INFISICAL_VAULT_FILE_PASSPHRASE": "devcontainer",
  "INFISICAL_TOKEN": "${localEnv:INFISICAL_TOKEN}"
}
```

#### Step 4: Restart Cursor and Rebuild

1. **Close Cursor completely** (env vars are read at startup)
2. Reopen the project
3. Rebuild the dev container (Ctrl+Shift+P → "Dev Containers: Rebuild Container")

#### Step 5: Verify

```bash
# In dev container terminal
infisical run --env=dev -- echo "Token works!"
```

### Running Services in Dev Container

```bash
# Frontend
cd /workspaces/Stock-And-Crypto-Tracker/services/frontend
infisical run --env=dev -- npm run dev

# Back-office
cd /workspaces/Stock-And-Crypto-Tracker/services/back-office
infisical run --env=dev -- npm run dev

# Docker services
infisical run --env=dev -- docker-compose up -d --build
```

### Troubleshooting Dev Container

#### "failed to fetch credentials from keyring"

**Cause**: Trying to use keyring auth in a container (no D-Bus).

**Solution**: Use service token as described above.

#### Token not being passed to container

**Cause**: Environment variable not set on host or Cursor not restarted.

**Verify on host:**
```powershell
# Windows
echo $env:INFISICAL_TOKEN

# macOS/Linux
echo $INFISICAL_TOKEN
```

**If empty**: Set the variable and restart Cursor completely.

#### "we couldn't find your logged in details"

**Cause**: `~/.infisical` vault file not syncing properly.

**Solution**: Use service token approach instead of vault file login.

---

## VM Usage (Machine Identity)

On the VM, Infisical uses **Machine Identity** authentication instead of user login.

### How It Works

1. Machine Identity is configured in Infisical Cloud
2. Machine Identity token is stored on VM (not in repo)
3. `./scripts/start-services.sh` authenticates automatically
4. Secrets are fetched from `prod` environment
5. Secrets are injected into docker-compose

### Deployment Command

```powershell
# On VM, secrets auto-inject via Machine Identity
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d"
```

**No manual `infisical login` needed on VM.**

---

## Adding New Secrets

### Step 1: Add to Infisical Cloud

1. Go to https://app.infisical.com
2. Select Stock Tracker workspace
3. Select `prod` environment
4. Click "Add Secret"
5. Enter key and value
6. Click "Save"

### Step 2: Reference in Code

**For frontend (Vercel)**:
```typescript
// Use NEXT_PUBLIC_ prefix
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

Infisical auto-syncs to Vercel. No additional config needed.

**For backend workers**:

Edit `docker-compose.yml`:
```yaml
services:
  twelvedata:
    environment:
      - TWELVE_DATA_API_KEY=${TWELVE_DATA_API_KEY}
```

Then use in code:
```csharp
var apiKey = Environment.GetEnvironmentVariable("TWELVE_DATA_API_KEY");
```

### Step 3: Test Locally

```powershell
# Run with Infisical
infisical run --env=prod -- docker-compose up -d

# Check if secret is accessible
docker-compose exec twelvedata env | grep TWELVE_DATA_API_KEY
```

### Step 4: Deploy to VM

Secrets are auto-injected via Machine Identity. Just deploy normally:

```powershell
gh workflow run "Deploy to Azure VM"
```

---

## Sync Targets

Infisical automatically syncs secrets to:

### 1. GitHub Secrets
- Used by GitHub Actions workflows
- Syncs all non-NEXT_PUBLIC_ secrets
- Example: `VM_SSH_PRIVATE_KEY`, `TWELVE_DATA_API_KEY`

### 2. Vercel
- Used by frontend deployment
- Syncs only `NEXT_PUBLIC_*` secrets
- Example: `NEXT_PUBLIC_SUPABASE_URL`

**Configuration**: Set up in Infisical Cloud → Integrations

---

## Key Secrets Reference

| Secret Name | Used By | Synced To | Notes |
|-------------|---------|-----------|-------|
| `TWELVE_DATA_API_KEY` | TwelveData worker | GitHub, VM | Stock data API |
| `SIMFIN_API_KEY` | SimFin worker | GitHub, VM | Company fundamentals API |
| `AI_HUB_API_KEY` | Workers, n8n | GitHub, VM | AI Hub authentication |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Vercel | Database URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Frontend | Vercel | Supabase anon key (public) |
| `DATABASE_CONNECTION_STRING` | Workers | GitHub, VM | Supabase connection string |
| `GRAFANA_SERVICE_ACCOUNT_TOKEN` | grafanactl | Local only | Dashboard deployment |
| `GRAFANA_CLOUD_API_KEY` | Alloy | GitHub, VM | Metrics push |
| `VM_SSH_PRIVATE_KEY` | GitHub Actions | GitHub only | CI/CD deployment |
| `PAT_GITHUB` | VM git clone | GitHub | Private repo access |

---

## Troubleshooting

### "Not logged in"

```powershell
# Login again
infisical login

# Verify
infisical whoami
```

### "Failed to fetch secrets"

**Cause**: Wrong environment or workspace.

**Solution**:
```powershell
# Check .infisical.json is in project root
cat .infisical.json

# Ensure using --env=prod
infisical run --env=prod -- <command>
```

### Secret Not Available in Container

**Cause**: Secret not referenced in docker-compose.yml.

**Solution**:
1. Check docker-compose.yml has the environment variable
2. Ensure Infisical has the secret in `prod` environment
3. Restart containers: `infisical run --env=prod -- docker-compose up -d`

### Machine Identity Not Working on VM

**Cause**: Machine Identity token expired or misconfigured.

**Solution**:
1. Check Machine Identity in Infisical Cloud
2. Regenerate token if needed
3. Update token on VM (SSH to VM and re-configure)

---

## Related

- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - Service environment variables
- [DevOps Tools](../../devops-tools/SKILL.md) - Deployment commands
