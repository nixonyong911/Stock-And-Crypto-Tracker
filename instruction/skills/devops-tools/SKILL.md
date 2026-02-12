---
name: devops-tools
description: DevOps operations for the Stock Tracker VM infrastructure. Use this skill for checking service health, viewing container logs, restarting services, deploying to Azure VM, triggering GitHub Actions workflows, and troubleshooting running containers. Triggers on "check service status", "view logs", "restart container", "deploy to vm", "trigger workflow", "docker ps", "health check", "service down", "container not running", "deployment failed", "rebuild service", "check twelvedata", "check metrics", "check n8n", "all services", "redeploy", "rollback", "workflow status", "ci/cd", "docker compose". This skill provides task-based quick commands - for SSH connection details or credential setup, use credentials-connections skill instead.
---

# DevOps Tools

## Table of Contents
- [Critical Gotchas](#critical-gotchas-read-first)
- [Check Service Health](#check-service-health)
- [View Logs](#view-logs)
- [Restart Services](#restart-services)
- [Deploy Changes](#deploy-changes)
- [Trigger GitHub Workflows](#trigger-github-workflows)
- [References](#references)

---

## CRITICAL GOTCHAS (Read First!)

1. **SSH Key Has Spaces**: The filename is `nx-linux-server-azure_key (1).pem` - MUST be quoted:
   ```powershell
   ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "command"
   ```

2. **Health Endpoints**: All services use `/health/live` pattern at base path.

3. **Deploy Path**: `/opt/stocktracker` on VM.

4. **PATH_BASE Required**: Workers need `/api/{worker}` prefix set (e.g., `/api/twelvedata`).

> **Infrastructure Details**: See [infrastructure-config.md](../../reference/infrastructure-config.md) for all IPs, ports, and URLs.

---

## Check Service Health

### Quick Status (All Containers)
```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

### Health Endpoints

| Service | Command |
|---------|---------|
| **TwelveData** | `curl -s https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live` |
| **Metrics** | `curl -s https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live` |
| **n8n** | `curl -s https://nxserver.malaysiawest.cloudapp.azure.com/` |

### Check Specific Container
```powershell
# Check if container is running
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps --filter name=twelvedata"
```

---

## View Logs

### Specific Service (Last 50 Lines)
```powershell
# TwelveData
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata --tail 50"

# Metrics
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs metrics --tail 50"

# n8n
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs n8n --tail 50"
```

### Follow Logs (Real-time)
```powershell
# Specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata -f"

# All services in docker-compose
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose logs -f"
```

---

## Restart Services

### Single Docker Compose Service
```powershell
# Restart specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart twelvedata"

ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart metrics"
```

### All Services (Full Restart)
```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart"
```

### Rebuild and Restart
```powershell
# Rebuild specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose up -d --build twelvedata"

# Rebuild all services (uses start-services.sh with Infisical)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d --build"
```

---

## Deploy Changes

### Via GitHub Actions (Preferred)
```powershell
# Trigger deployment workflow
gh workflow run "Deploy to Azure VM"

# Check recent deployment runs
gh run list --workflow=deploy-vm.yml --limit 3

# View specific run
gh run view <run-id>

# Watch in progress
gh run watch
```

### Manual Deployment (If GitHub Actions Unavailable)
```powershell
# Pull latest code and restart services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker/repo && git pull && cd /opt/stocktracker && ./scripts/start-services.sh up -d --build"
```

---

## Trigger GitHub Workflows

### Deploy to VM
```powershell
# Trigger workflow
gh workflow run deploy-vm.yml

# With force build
gh workflow run deploy-vm.yml -f force_build=true

# List recent runs
gh run list --workflow=deploy-vm.yml --limit 5

# Re-run failed workflow
gh run rerun <run-id>

# Cancel running workflow
gh run cancel <run-id>
```

---

## Local Development Commands

### Run with Infisical Secrets
```powershell
# Build and start all services with secrets injected
infisical run --env=prod -- docker-compose up -d --build

# Start without rebuild
infisical run --env=prod -- docker-compose up -d

# View local logs
docker-compose logs -f
```

### Vercel Frontend Deployment
```powershell
# Navigate to frontend
cd services/frontend

# Deploy to production (manual - auto-deploys on main branch push)
vercel --prod

# Deploy preview
vercel
```

**Note**: Frontend auto-deploys from `main` branch via GitHub integration.

---

## References

### Detailed Guides
- [Service Endpoints](references/service-endpoints.md) - All URLs, ports, API endpoint tables
- [Docker Commands](references/docker-commands.md) - Complete Docker operation reference
- [GitHub Workflows](references/github-workflows.md) - CI/CD workflow details

### Cross-Skill References
- **Need SSH setup or credentials?** See [credentials-connections](../credentials-connections/SKILL.md)
- **Infrastructure values?** See [infrastructure-config.md](../../reference/infrastructure-config.md)
