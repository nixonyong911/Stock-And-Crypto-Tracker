# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Microservices-based stock and cryptocurrency tracker:
- **Frontend**: Next.js 15 on Vercel (public-facing)
- **Back-office**: Next.js admin UI on Azure VM (Docker)
- **Backend**: .NET 8 workers + Python AI services on Azure VM (Docker + Caddy)
- **Database**: Supabase (PostgreSQL) with EF Core migrations
- **Observability**: Grafana Cloud (metrics + logs via Alloy)

## Build & Development Commands

### Local Development

```bash
# Inject secrets from Infisical and run all services
infisical run --env=prod -- docker-compose up -d

# .NET worker (e.g., TwelveData)
cd services/data-fetchers/TwelveData
dotnet restore && dotnet run --project src/TwelveData.Worker

# Metrics Service
cd services/metrics/StockTracker.Metrics
dotnet restore && dotnet run

# Frontend
cd services/frontend
npm install && npm run dev

# Back-office
cd services/back-office
npm install && npm run dev
```

### Testing

```bash
# .NET
dotnet test services/data-fetchers/TwelveData

# Node.js (frontend/back-office)
npm test
```

### Database Migrations (EF Core)

```bash
cd services/common/StockTracker.Data.Migrations
dotnet run -- migrate  # Apply pending migrations
dotnet run -- status   # Check migration status
```

## Architecture

```
services/
├── ai/ai-hub/                    # Python FastAPI (systemd on host, not Docker)
├── back-office/                  # Next.js admin UI (Docker on VM)
├── common/
│   ├── StockTracker.Data/        # EF Core entities & DbContext
│   ├── StockTracker.Data.Migrations/  # Migration CLI
│   └── StockTracker.Common/      # Shared utilities (metrics, health)
├── data-fetchers/
│   └── TwelveData/               # Stock data worker (Docker on VM)
├── frontend/                     # Next.js public app (Vercel)
└── metrics/                      # Metrics aggregation service

deployment/vm/
├── docker-compose.yml            # Production services
├── Caddyfile                     # Reverse proxy routes
└── scripts/                      # Start scripts

instruction/
├── rules/                        # Project laws (always applied)
├── skills/                       # On-demand procedures
└── KNOWLEDGE.md                  # Project state & learnings
```

### Key Patterns

- **Workers** implement `/health/live` and `/health/ready` endpoints
- **PATH_BASE** env var for sub-path deployment (e.g., `/api/twelvedata`)
- **AI Hub** runs on host as systemd service; containers use `host.docker.internal:8084`
- **Secrets** managed via Infisical Cloud with Machine Identity on VM

## Critical Rules

### Secrets (NEVER commit real credentials)
- All secrets in **Infisical Cloud** → auto-sync to GitHub/Vercel
- Use `infisical run --env=prod -- <command>` for local dev
- `.env.example` uses placeholders only

### Data Access
- **Dapper** for queries (performance); **EF Core** for migrations only
- PostgreSQL TIME columns map to `TimeSpan` (not `TimeOnly`) in C#
- Supabase RLS enabled on `data_sources` table (requires service role key)

### Docker
- Multi-stage builds required
- Non-root user in production images
- Build context differs: `services/` (GHA) vs `./repo/services` (VM docker-compose)

### CI/CD
- Push to `main` triggers `deploy-vm.yml`
- Images built on GitHub Actions, transferred via SCP to VM
- Health polling replaces fixed sleep delays

## Coding Conventions

### C# (.NET 8)
- PascalCase: classes, methods, properties
- _camelCase: private fields
- Async all the way (never `.Result` or `.Wait()`)
- Serilog for structured logging

### TypeScript
- camelCase: variables, functions
- PascalCase: types, interfaces, components
- Avoid `any`; use proper typing
- Server Components by default (Next.js App Router)

### Environment Variables (.NET)
Double-underscore notation overrides nested config:
```yaml
# appsettings.json: { "TwelveData": { "ApiKey": "" } }
TwelveData__ApiKey=${TWELVE_DATA_API_KEY}
```

## Service URLs (Production)

| Service | URL |
|---------|-----|
| TwelveData API | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| Back-Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office |
| Frontend | https://stock-tracker.vercel.app/ |

## Extended Documentation

Detailed instructions live in `instruction/`:
- `rules/` - Always-applied project laws (security, conventions, CI/CD)
- `skills/` - On-demand procedures (creating workers, CLI commands)
- `KNOWLEDGE.md` - Current project state and recent learnings

Read `instruction/KNOWLEDGE.md` first for active components and gotchas.
