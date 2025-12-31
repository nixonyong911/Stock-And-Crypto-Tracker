# Architecture Documentation

This folder contains documentation related to system architecture, deployments, infrastructure, and CI/CD.

## Documents

| Document | Description |
|----------|-------------|
| [overview.md](overview.md) | Overall system architecture and design |
| [vm-deployment-architecture.md](vm-deployment-architecture.md) | Azure VM deployment (current setup) |
| [infrastructure-reference.md](infrastructure-reference.md) | Quick reference for all resources, credentials, and URLs |
| [vercel-frontend-deployment.md](vercel-frontend-deployment.md) | Vercel frontend deployment guide |
| [infisical-secrets-management.md](infisical-secrets-management.md) | Secrets management with Infisical |

## Architecture Summary

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    Vercel      │     │   Azure VM     │     │   Supabase     │
│   (Frontend)   │     │   (Backend)    │     │  (Database)    │
├────────────────┤     ├────────────────┤     ├────────────────┤
│  Next.js App   │────▶│  TwelveData    │────▶│  PostgreSQL    │
│                │     │  n8n, Caddy    │     │                │
└────────────────┘     └────────────────┘     └────────────────┘
       │                                              ▲
       └──────────────────────────────────────────────┘
                    (Supabase Client)
```

## Hosting Overview

| Component | Provider | Auto-Deploy |
|-----------|----------|-------------|
| Frontend (Next.js) | Vercel | Yes (git push) |
| Backend Workers (.NET) | Azure VM | Yes (GitHub Actions → SSH) |
| Database | Supabase | N/A (managed) |

## Categories

### System Design
- **[overview.md](overview.md)** - High-level system architecture, component interactions, and design decisions

### Deployment & CI/CD
- **[vm-deployment-architecture.md](vm-deployment-architecture.md)** - Backend deployment on Azure VM via SSH
- **[vercel-frontend-deployment.md](vercel-frontend-deployment.md)** - Frontend deployment with Vercel

### Infrastructure
- **[infrastructure-reference.md](infrastructure-reference.md)** - Resource IDs, URLs, secrets reference
- **[infisical-secrets-management.md](infisical-secrets-management.md)** - Centralized secrets management

### Archived (Historical Reference)
- **[azure-container-apps-deployment.md](azure-container-apps-deployment.md)** - Deprecated: Container Apps setup (migrated to VM Dec 2025)
