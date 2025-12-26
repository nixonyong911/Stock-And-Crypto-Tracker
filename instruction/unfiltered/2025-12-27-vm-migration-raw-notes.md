# VM Migration Raw Notes

**Date**: December 27, 2025
**Session**: Full migration from Azure Container Apps to Azure VM

## Context

This migration was performed in a single Cursor AI session. The user wanted to:
1. Move all backend services from Azure Container Apps to a single Azure VM
2. Set up Caddy as reverse proxy (not Nginx)
3. Use GitHub Actions for CI/CD (SSH to VM, not ACR)
4. Integrate with existing Infisical secrets management
5. Retire AlphaVantage worker completely

## Key Decisions Made

### 1. Caddy over Nginx
- User explicitly requested Caddy
- Automatic HTTPS via Let's Encrypt
- Simpler configuration syntax

### 2. CaddyManager Removed
- Initially planned to add CaddyManager GUI
- Docker image (`ghcr.io/rhad00/caddymanager`) returned "access denied"
- Decided to proceed without GUI - Caddy Admin API available via SSH

### 3. GitHub PAT Secret Naming
- User created secret as `PAT_GITHUB` instead of `GITHUB_PAT`
- Reason: Infisical integration doesn't allow `GITHUB_` prefix
- Workflow updated to use `PAT_GITHUB`

### 4. Phase 1 Only
- User requested to focus on core services first
- Metrics and AI-Hub disabled for Phase 2
- Reason: AI-Hub needs API keys not yet configured

### 5. Infisical on VM Cancelled
- Original plan: Install Infisical CLI on VM, run `infisical run`
- Simplified to: GitHub Secrets → SSH → Environment Variables
- Reason: Simpler setup, Infisical already syncs to GitHub

## Commands Run

### Azure Cleanup
```powershell
# Delete Container Apps
az containerapp delete --name ca-twelvedata --resource-group rg-stocktracker --yes
az containerapp delete --name ca-alphavantage --resource-group rg-stocktracker --yes
az containerapp delete --name ca-metrics --resource-group rg-stocktracker --yes

# Delete Container Apps Environment
az containerapp env delete --name cae-stocktracker --resource-group rg-stocktracker --yes --no-wait
```

### VM Setup
```bash
# SSH to VM
ssh azureuser@20.17.176.1

# Create directory structure
sudo mkdir -p /opt/stocktracker/{repo,scripts,logs}
sudo chown -R azureuser:azureuser /opt/stocktracker

# Clone repo
cd /opt/stocktracker
git clone https://github.com/<user>/Stock-And-Crypto-Tracker.git repo

# Backup n8n data
cp -r ~/n8n-data /tmp/n8n-backup

# Stop old n8n
cd ~/docker-compose-project
docker compose down

# Move n8n data
mv /tmp/n8n-backup /opt/stocktracker/n8n-data

# Setup cron
crontab -e
# 0 6 * * 1-5 /opt/stocktracker/scripts/run-twelvedata.sh
```

### Docker Commands on VM
```bash
# Build and start
cd /opt/stocktracker
docker compose build --no-cache twelvedata
docker compose up -d

# Check status
docker ps
docker logs twelvedata
docker logs caddy
docker logs n8n
```

## Files Created

1. `deployment/vm/docker-compose.yml` - Services config
2. `deployment/vm/Caddyfile` - Reverse proxy routes
3. `deployment/vm/scripts/setup.sh` - Initial VM setup
4. `deployment/vm/scripts/run-twelvedata.sh` - Cron job script
5. `.github/workflows/deploy-vm.yml` - CI/CD pipeline
6. `instruction/history/azure/2025-12-27-full-vm-migration-from-container-apps.md`
7. `instruction/architecture/vm-deployment-architecture.md`
8. `instruction/todo/phase-2-vm-services.md`
9. Updated `instruction/cli/caddy/worker-endpoints.md`
10. Updated `.cursorrules`
11. Updated `instruction/README.md`
12. Updated `instruction/architecture/overview.md`

## Files Deleted

1. `.github/workflows/deploy-azure.yml` - Old ACA pipeline

## Issues Encountered

### 1. Private Repo Clone Failure
- Error: "fatal: could not read Username for 'https://github.com'"
- Fix: Added `PAT_GITHUB` secret for authenticated clone

### 2. CaddyManager Image Access Denied
- Error: "Head 'https://ghcr.io/v2/rhad00/caddymanager/manifests/latest': denied"
- Fix: Removed CaddyManager from deployment

### 3. Environment Variable Mapping
- Issue: Docker Compose expected `DATABASE_CONNECTION_STRING` but GitHub had different name
- Fix: Workflow passes secrets explicitly to docker compose

### 4. Container Apps Environment Deletion Timeout
- Issue: Deletion command timed out
- Fix: Used `--no-wait` flag

## Verification Steps Performed

1. ✅ `docker ps` - All containers running
2. ✅ n8n accessible at root URL
3. ✅ TwelveData Swagger accessible
4. ✅ TwelveData health check returns healthy
5. ✅ GitHub Actions workflow successful
6. ✅ Azure Container Apps deleted

## Next Steps (Phase 2)

1. Enable Metrics Service
2. Configure AI-Hub API keys
3. Enable AI-Hub Service
4. Consider log aggregation (Loki/Grafana)
5. Consider monitoring (Prometheus)

