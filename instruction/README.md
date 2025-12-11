# Instruction Documentation

This folder contains all documentation for the Stock and Crypto Tracker project.

## Folder Structure

```
instruction/
├── README.md                 # This file - main index
├── architecture/             # System design, deployments, infrastructure
├── database/                 # Database schema, configuration
├── cli/                      # CLI commands reference
└── ai-agent/                 # AI agent guides
```

## Categories

| Folder | Description |
|--------|-------------|
| [architecture/](architecture/) | System architecture, deployments, CI/CD |
| [database/](database/) | Database schema, configuration, security |
| [cli/](cli/) | CLI commands and tools reference |
| [ai-agent/](ai-agent/) | AI agent trading analysis guides |

## Quick Links

### Architecture
- [Architecture Overview](architecture/README.md)
- [Azure Deployment](architecture/azure-container-apps-deployment.md)
- [Vercel Deployment](architecture/vercel-frontend-deployment.md)
- [Infrastructure Reference](architecture/infrastructure-reference.md)

### Database
- [Database Overview](database/README.md)
- [Schema Reference](database/schema.md)

### CLI
- [CLI Overview](cli/README.md)
- [EF Migrations](cli/ef-migrations.md)

### AI Agent
- [Candlestick Analysis](ai-agent/candlestick-analysis.md)

## Quick Start

### Deploy Backend (Azure)
1. Make changes to `services/data-fetchers/`, `services/metrics/`, or `services/common/`
2. Commit and push to `main` branch
3. GitHub Actions automatically deploys to Azure Container Apps

### Deploy Frontend (Vercel)
1. Make changes to `services/frontend/`
2. Commit and push to `main` branch
3. Vercel automatically deploys
