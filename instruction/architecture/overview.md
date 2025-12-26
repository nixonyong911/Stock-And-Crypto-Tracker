# System Architecture Overview

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM OVERVIEW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌───────────────────────────────┐    ┌─────────────┐ │
│   │   FRONTEND   │    │           BACKEND             │    │  DATABASE   │ │
│   │   (Vercel)   │    │    (Azure Container Apps)     │    │ (Supabase)  │ │
│   ├──────────────┤    ├───────────────────────────────┤    ├─────────────┤ │
│   │              │    │                               │    │             │ │
│   │  Next.js     │    │  ┌─────────────────────────┐  │    │ PostgreSQL  │ │
│   │  - SSR       │    │  │  AlphaVantage Worker    │  │    │             │ │
│   │  - React     │───▶│  │  - Fetches stock data   │──┼───▶│  Tables:    │ │
│   │              │    │  │  - Scheduled execution  │  │    │  - stocks   │ │
│   │              │    │  └─────────────────────────┘  │    │  - crypto   │ │
│   │              │    │                               │    │  - status   │ │
│   │              │    │  ┌─────────────────────────┐  │    │             │ │
│   │              │    │  │  Metrics Service        │  │    │             │ │
│   │              │◀───│  │  - Aggregates metrics   │  │    │             │ │
│   │              │    │  │  - Health monitoring    │  │    │             │ │
│   │              │    │  └─────────────────────────┘  │    │             │ │
│   │              │    │                               │    │             │ │
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

### Backend Workers (Azure Container Apps)

| Service | Technology | Purpose |
|---------|------------|---------|
| AlphaVantage Worker | .NET 8 Worker Service | Fetches stock/crypto data from Alpha Vantage API |
| Metrics Service | .NET 8 Web API | Aggregates and exposes metrics for monitoring |

**Key Features**:
- Scheduled data fetching (configurable intervals)
- Health check endpoints for container orchestration
- Internal service-to-service communication

### Database (Supabase)

| Attribute | Value |
|-----------|-------|
| Type | PostgreSQL 15 |
| Hosting | Supabase (managed) |
| Features | Row Level Security, Real-time subscriptions |

## Data Flow

### Stock Data Fetch Flow

```
1. [AlphaVantage Worker] Timer triggers fetch
         │
         ▼
2. [Alpha Vantage API] GET /query?function=GLOBAL_QUOTE
         │
         ▼
3. [AlphaVantage Worker] Parse and transform response
         │
         ▼
4. [Supabase] INSERT/UPDATE stock_prices table
         │
         ▼
5. [Frontend] Real-time update via Supabase subscription
         │
         ▼
6. [User] Sees updated price in UI
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

## Service Communication

```
┌─────────────────┐         ┌─────────────────┐
│   AlphaVantage  │◀───────▶│    Metrics      │
│     Worker      │  HTTP   │    Service      │
└────────┬────────┘         └─────────────────┘
         │                           │
         │ Supabase Client           │ Internal only
         ▼                           │
┌─────────────────┐                  │
│    Supabase     │                  │
│   PostgreSQL    │                  │
└─────────────────┘                  │
         ▲                           │
         │ Supabase Client           │
         │                           │
┌────────┴────────┐                  │
│    Frontend     │                  │
│    (Vercel)     │                  │
└─────────────────┘                  │
```

## Security Model

### Authentication & Authorization

| Layer | Method |
|-------|--------|
| Frontend → Supabase | Anon Key (Row Level Security) |
| Backend → Supabase | Service Role Key (bypasses RLS) |
| Backend → Backend | Internal networking (Azure VNet) |

### Secrets Management

| Environment | Method |
|-------------|--------|
| Local Development | `.env` files, `appsettings.json` |
| Production (Azure) | GitHub Secrets → Container App Environment Variables |
| Production (Vercel) | Vercel Environment Variables |

## Scalability Considerations

### Current Architecture
- Single instance of each worker service
- Supabase handles database scaling automatically
- Vercel auto-scales frontend globally

### Future Scaling Options
- Multiple worker instances with distributed locking
- Azure Container Apps auto-scaling rules
- Redis cache layer for frequently accessed data

## Related Documents

- [Infrastructure Reference](infrastructure-reference.md) - Resource IDs and URLs
- [Azure Deployment](azure-container-apps-deployment.md) - Backend CI/CD
- [Vercel Deployment](vercel-frontend-deployment.md) - Frontend CI/CD
- [Database Documentation](../database/README.md) - Schema and migrations


















