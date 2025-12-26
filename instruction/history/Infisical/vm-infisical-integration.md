# VM Infisical Integration

**Date**: December 27, 2025  
**Status**: 🔴 NOT COMPLETED - Simplified during migration

## Original Plan

The original plan was to have **Infisical CLI installed on the Azure VM** so that:
1. Secrets are centralized in Infisical Cloud (single source of truth)
2. VM pulls secrets directly from Infisical at runtime
3. No need to create/manage `.env` files on VM
4. Secrets auto-rotate without redeployment

### Intended Flow

```
Infisical Cloud (source of truth)
       │
       ├──► GitHub Secrets (auto-sync) ──► GitHub Actions
       │
       ├──► Vercel (auto-sync) ──► Frontend
       │
       └──► Azure VM (Infisical CLI) ──► Docker containers
                   │
                   └── infisical run --env=production -- docker compose up -d
```

## What Actually Happened

During the VM migration session, we **simplified** the approach:
- Skipped Infisical CLI installation on VM
- Created a `.env` file manually on VM with secrets
- GitHub Actions passes secrets via SSH environment variables

### Current (Simplified) Flow

```
Infisical Cloud
       │
       └──► GitHub Secrets ──► GitHub Actions ──► SSH ──► VM .env file
```

## Why It Was Simplified

1. **Time pressure**: Wanted to get the migration working quickly
2. **Complexity**: Adding another dependency (Infisical CLI) on VM
3. **Quick fix**: `.env` file works, just not ideal

## Problems with Current Approach

| Issue | Impact |
|-------|--------|
| `.env` file on VM | Secrets not centralized, manual updates needed |
| GitHub Actions passes secrets | One more hop, secrets in pipeline logs (masked) |
| Secret rotation | Requires manual VM update or redeployment |
| Multiple env files | `.env` on VM, GitHub Secrets, Infisical - can get out of sync |

## TODO: Implement Proper Infisical Integration

### Prerequisites
- [ ] Infisical account with Machine Identity (Universal Auth)
- [ ] VM has internet access to Infisical API

### Step 1: Create Machine Identity in Infisical

1. Go to https://app.infisical.com → Project: `Stock and Crypto`
2. Navigate to **Access Control** → **Machine Identities**
3. Click **Create Machine Identity**
4. Name: `azure-vm-stocktracker`
5. Authentication Method: **Universal Auth**
6. Copy the **Client ID** and **Client Secret**

### Step 2: Install Infisical CLI on VM

```bash
ssh azureuser@20.17.176.1

# Install Infisical CLI
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# Verify installation
infisical --version
```

### Step 3: Configure Infisical on VM

```bash
# Create config directory
mkdir -p /opt/stocktracker/config

# Store credentials securely (one-time setup)
# These will be used to authenticate with Infisical
cat > /opt/stocktracker/config/infisical-auth.sh << 'EOF'
export INFISICAL_CLIENT_ID="<from step 1>"
export INFISICAL_CLIENT_SECRET="<from step 1>"
EOF
chmod 600 /opt/stocktracker/config/infisical-auth.sh
```

### Step 4: Update docker-compose.yml

Remove hardcoded env vars, use Infisical injection:

```yaml
# deployment/vm/docker-compose.yml
services:
  twelvedata:
    build: ...
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:8080
      # Secrets will be injected by infisical run
```

### Step 5: Update Startup Script

Create `/opt/stocktracker/start-services.sh`:

```bash
#!/bin/bash
cd /opt/stocktracker

# Load Infisical credentials
source /opt/stocktracker/config/infisical-auth.sh

# Authenticate and inject secrets
infisical run --env=production --projectId=<project-id> -- docker compose up -d
```

### Step 6: Update GitHub Actions

Modify `.github/workflows/deploy-vm.yml` to use Infisical on VM:

```yaml
- name: Deploy services
  run: |
    ssh azureuser@20.17.176.1 << 'EOF'
      cd /opt/stocktracker
      source config/infisical-auth.sh
      infisical run --env=production -- docker compose up -d
    EOF
```

### Step 7: Remove .env File

Once Infisical integration is working:

```bash
ssh azureuser@20.17.176.1
rm /opt/stocktracker/.env
```

## Benefits After Implementation

| Benefit | Description |
|---------|-------------|
| **Centralized secrets** | Only Infisical Cloud to manage |
| **Auto-rotation** | Update in Infisical, restart container |
| **Audit trail** | Infisical logs all secret access |
| **No .env files** | Secrets never written to disk |
| **Consistent** | Same approach as local dev |

## Related Documents

- [Infisical Secrets Management](../../architecture/infisical-secrets-management.md)
- [VM Deployment Architecture](../../architecture/vm-deployment-architecture.md)
- [Phase 2 TODO](../../todo/phase-2-vm-services.md)

## Notes

- The simplified approach works but is not ideal for production
- Priority: **Medium** - Should implement before adding more services
- Estimate: ~30 minutes to implement

