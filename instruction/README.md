# Instruction Documentation

This folder contains all documentation for the Stock and Crypto Tracker project.

## Folder Structure

```
instruction/
├── README.md                 # This file - main index
├── architecture/             # System design, deployments, infrastructure
├── database/                 # Database schema, configuration
├── cli/                      # CLI commands reference
├── history/                  # Migration and change history
├── todo/                     # Phase tracking and TODOs
├── reference/                # Integration guides
└── ai-agent/                 # AI agent guides
```

## Categories

| Folder | Description |
|--------|-------------|
| [architecture/](architecture/) | System architecture, deployments, CI/CD |
| [database/](database/) | Database schema, configuration, security |
| [cli/](cli/) | CLI commands and tools reference |
| [history/](history/) | Migration history and change logs |
| [todo/](todo/) | Phase tracking and pending tasks |
| [reference/](reference/) | Integration and how-to guides |
| [ai-agent/](ai-agent/) | AI agent trading analysis guides |

## Quick Links

### Architecture
- [Architecture Overview](architecture/overview.md)
- [VM Deployment](architecture/vm-deployment-architecture.md) ← **Current Setup**
- [Vercel Deployment](architecture/vercel-frontend-deployment.md)
- [Infrastructure Reference](architecture/infrastructure-reference.md)
- [Infisical Secrets](architecture/infisical-secrets-management.md)

### Database
- [Database Overview](database/README.md)
- [Schema Reference](database/schema.md)

### CLI
- [CLI Overview](cli/README.md)
- [Worker Endpoints](cli/caddy/worker-endpoints.md)
- [PowerShell Functions](cli/powershell/profile-functions.md)

### History
- [VM Migration (Dec 2025)](history/azure/2025-12-27-full-vm-migration-from-container-apps.md)

### TODO
- [Phase 2 Services](todo/phase-2-vm-services.md)

### AI Agent
- [Candlestick Analysis](ai-agent/candlestick-analysis.md)

## Service Endpoints

| Service | URL |
|---------|-----|
| n8n Dashboard | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| Frontend | https://stock-tracker.vercel.app/ |

## Quick Start

### Deploy Backend (Azure VM)
1. Make changes to `services/data-fetchers/TwelveData/`, `services/common/`, or `deployment/vm/`
2. Commit and push to `main` branch
3. GitHub Actions automatically deploys via SSH to Azure VM

### Deploy Frontend (Vercel)
1. Make changes to `services/frontend/`
2. Commit and push to `main` branch
3. Vercel automatically deploys

### SSH to VM
```powershell
# Using PowerShell alias
ssh-azure

# Or direct SSH
ssh -i "$HOME\.ssh\nx-linux-server-azure_key.pem" azureuser@20.17.176.1
```

### Check Services on VM
```bash
docker ps                    # List running containers
docker logs <service>        # View logs
docker compose up -d --build # Rebuild and restart
```
