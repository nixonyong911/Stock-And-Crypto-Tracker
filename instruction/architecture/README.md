# Architecture Documentation

This folder contains documentation related to system architecture, deployments, infrastructure, and CI/CD.

## Documents

| Document | Description |
|----------|-------------|
| [overview.md](overview.md) | Overall system architecture and design |
| [infrastructure-reference.md](infrastructure-reference.md) | Quick reference for all resources, credentials, and URLs |
| [azure-container-apps-deployment.md](azure-container-apps-deployment.md) | Azure Container Apps deployment and CI/CD guide |
| [vercel-frontend-deployment.md](vercel-frontend-deployment.md) | Vercel frontend deployment guide |

## Architecture Summary

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│    Vercel      │     │  Azure (ACA)   │     │   Supabase     │
│   (Frontend)   │     │   (Backend)    │     │  (Database)    │
├────────────────┤     ├────────────────┤     ├────────────────┤
│  Next.js App   │────▶│ AlphaVantage   │────▶│  PostgreSQL    │
│                │     │ Metrics        │     │                │
└────────────────┘     └────────────────┘     └────────────────┘
       │                                              ▲
       └──────────────────────────────────────────────┘
                    (Supabase Client)
```

## Hosting Overview

| Component | Provider | Auto-Deploy |
|-----------|----------|-------------|
| Frontend (Next.js) | Vercel | Yes (git push) |
| Backend Workers (.NET) | Azure Container Apps | Yes (GitHub Actions) |
| Database | Supabase | N/A (managed) |

## Categories

### System Design
- **[overview.md](overview.md)** - High-level system architecture, component interactions, and design decisions

### Deployment & CI/CD
- **[azure-container-apps-deployment.md](azure-container-apps-deployment.md)** - Backend deployment with GitHub Actions
- **[vercel-frontend-deployment.md](vercel-frontend-deployment.md)** - Frontend deployment with Vercel

### Infrastructure
- **[infrastructure-reference.md](infrastructure-reference.md)** - Resource IDs, URLs, secrets reference


