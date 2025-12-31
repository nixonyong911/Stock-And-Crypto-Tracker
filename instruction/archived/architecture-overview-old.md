# System Architecture Overview

**Last Updated**: December 27, 2025

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM OVERVIEW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌───────────────────────────────┐    ┌─────────────┐ │
│   │   FRONTEND   │    │           BACKEND             │    │  DATABASE   │ │
│   │   (Vercel)   │    │       (Azure VM + Docker)     │    │ (Supabase)  │ │
│   ├──────────────┤    ├───────────────────────────────┤    ├─────────────┤ │
│   │              │    │                               │    │             │ │
│   │  Next.js     │    │  ┌─────────────────────────┐  │    │ PostgreSQL  │ │
│   │  - SSR       │    │  │  Caddy (Reverse Proxy)  │  │    │             │ │
│   │  - React     │───▶│  │  Auto HTTPS + Routing   │  │    │  Tables:    │ │
│   │              │    │  └──────────┬──────────────┘  │    │  - stocks   │ │
│   │              │    │             │                 │    │  - crypto   │ │
│   │              │    │  ┌──────────┼──────────────┐  │    │  - status   │ │
│   │              │    │  │          │              │  │    │             │ │
│   │              │    │  │ ┌────────┴───────┐      │  │    │             │ │
│   │              │    │  │ │     n8n        │      │──┼───▶│             │ │
│   │              │    │  │ │  (Workflows)   │      │  │    │             │ │
│   │              │    │  │ └────────────────┘      │  │    │             │ │
│   │              │    │  │                         │  │    │             │ │
│   │              │    │  │ ┌────────────────┐      │  │    │             │ │
│   │              │    │  │ │  TwelveData    │      │──┼───▶│             │ │
│   │              │◀───│  │ │   Worker       │      │  │    │             │ │
│   │              │    │  │ └────────────────┘      │  │    │             │ │
│   │              │    │  │                         │  │    │             │ │
│   │              │    │  │ ┌────────────────┐      │  │    │             │ │
│   │              │    │  │ │  Metrics       │      │  │    │             │ │
│   │              │    │  │ │  (Phase 2)     │      │  │    │             │ │
│   │              │    │  │ └────────────────┘      │  │    │             │ │
│   │              │    │  │                         │  │    │             │ │
│   │              │    │  │ ┌────────────────┐      │  │    │             │ │
│   │              │    │  │ │  AI-Hub        │      │  │    │             │ │
│   │              │    │  │ │  (Phase 2)     │      │  │    │             │ │
│   │              │    │  │ └────────────────┘      │  │    │             │ │
│   │              │    │  └─────────────────────────┘  │    │             │ │
│   └──────────────┘    └───────────────────────────────┘    └─────────────┘ │
│          │                                                        ▲        │
│          └────────────────────────────────────────────────────────┘        │
│                           (Direct Supabase Client)                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Frontend (Vercel)

| Attribute | Value |
|-----------|-------|
| Technology | Next.js 14 (App Router) |
| Hosting | Vercel Edge Network |
| Deployment | Auto-deploy on git push |
| Data Access | Supabase Client (SSR + Client) |

**Key Features**:
- Server-side rendering for SEO and performance
- Real-time data updates via Supabase subscriptions
- Responsive design for mobile and desktop

### Backend Workers (Azure VM)

| Service | Technology | Purpose | Status |
|---------|------------|---------|--------|
| Caddy | Caddy 2 (Alpine) | Reverse proxy with auto HTTPS | ✅ Active |
| n8n | n8nio/n8n | Workflow automation | ✅ Active |
| TwelveData Worker | .NET 8 Web API | Fetches stock/crypto data | ✅ Active |
| Metrics Service | .NET 8 Web API | Aggregates metrics | ⏸️ Phase 2 |
| AI-Hub | Python FastAPI | AI model gateway | ⏸️ Phase 2 |

**Key Features**:
- Docker Compose orchestration
- Automatic HTTPS via Let's Encrypt (Caddy)
- Scheduled data fetching via cron
- Swagger UI for all workers

### Database (Supabase)

| Attribute | Value |
|-----------|-------|
| Type | PostgreSQL 15 |
| Hosting | Supabase (managed) |
| Features | Row Level Security, Real-time subscriptions |

## Service Endpoints

| Service | URL |
|---------|-----|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| TwelveData Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live |
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger (Phase 2) |
| AI-Hub Docs | https://nxserver.malaysiawest.cloudapp.azure.com/api/ai-hub/docs (Phase 2) |

## Data Flow

### Stock Data Fetch Flow

```
1. [Cron] Triggers at 06:00 UTC (Mon-Fri)
         │
         ▼
2. [TwelveData Worker] Runs fetch job
         │
         ▼
3. [TwelveData API] GET time_series endpoint
         │
         ▼
4. [TwelveData Worker] Parse and transform response
         │
         ▼
5. [Supabase] INSERT/UPDATE stock_prices table
         │
         ▼
6. [Frontend] Real-time update via Supabase subscription
         │
         ▼
7. [User] Sees updated price in UI
```

### Frontend Data Access Flow

```
1. [User] Navigates to page
         │
         ▼
2. [Vercel Edge] Executes Server Component
         │
         ▼
3. [Supabase] Query via createServerSupabaseClient()
         │
         ▼
4. [Vercel Edge] Render HTML with data
         │
         ▼
5. [User] Receives fully rendered page
```

## CI/CD Pipeline

```
┌──────────────┐      ┌──────────────┐      ┌──────────────────────────────┐
│   Developer  │      │    GitHub    │      │          Azure VM            │
│              │      │   Actions    │      │                              │
│  git push    │─────▶│              │──SSH─▶│  1. git pull                 │
│              │      │  Triggers:   │      │  2. docker compose build     │
│              │      │  - main push │      │  3. docker compose up -d     │
│              │      │  - manual    │      │  4. Health checks            │
└──────────────┘      └──────────────┘      └──────────────────────────────┘
```

## Security Model

### Authentication & Authorization

| Layer | Method |
|-------|--------|
| Frontend → Supabase | Anon Key (Row Level Security) |
| Backend → Supabase | Service Role Key (bypasses RLS) |
| Internet → VM | Caddy (HTTPS only, ports 80/443) |
| SSH → VM | Private key authentication |

### Secrets Management

| Environment | Method |
|-------------|--------|
| Source of Truth | Infisical Cloud |
| Production (VM) | GitHub Secrets → SSH → Environment Variables |
| Production (Vercel) | Infisical auto-sync to Vercel |
| Local Development | `infisical run --env=prod -- <command>` |

## VM Infrastructure

| Property | Value |
|----------|-------|
| Name | nx-linux-server-azure |
| Resource Group | NIXON-CITY |
| Size | Standard_B2s (2 vCPU, 4GB RAM) |
| Location | Malaysia West |
| Public IP | 20.17.176.1 |
| DNS | nxserver.malaysiawest.cloudapp.azure.com |

## Related Documents

- [VM Deployment Architecture](vm-deployment-architecture.md) - Detailed VM setup
- [Infrastructure Reference](infrastructure-reference.md) - Resource IDs and URLs
- [Vercel Deployment](vercel-frontend-deployment.md) - Frontend CI/CD
- [Database Documentation](../database/README.md) - Schema and migrations
- [Worker Endpoints](../cli/caddy/worker-endpoints.md) - Service URLs
