# Stock and Crypto Tracker - Project Context

## Project Overview

A microservices-based stock and cryptocurrency tracking application with:
- **Frontend**: Next.js on Vercel (public-facing)
- **Back-office**: Next.js admin UI on Azure VM (internal tools)
- **Backend**: .NET 8 workers + Python AI services on Azure VM (Docker + Caddy)
- **Database**: Supabase (PostgreSQL) with EF Core migrations
- **Observability**: Grafana Cloud (metrics + logs via Alloy)
- **Purpose**: Fetch market data, store 10-min candles, enable AI trading analysis

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, TypeScript, Supabase Client (Vercel) |
| Back-office | Next.js 16, TypeScript, Tailwind, shadcn/ui (VM) |
| Backend Workers | .NET 8, Dapper, ASP.NET Core |
| AI Services | Python 3, FastAPI (ai-hub as systemd service) |
| Database | PostgreSQL (Supabase), EF Core for migrations |
| Shared Library | StockTracker.Data (entities), StockTracker.Common (utilities) |
| CI/CD | GitHub Actions → SSH → Azure VM |
| Reverse Proxy | Caddy (auto HTTPS via Let's Encrypt) |
| Observability | Grafana Cloud, Grafana Alloy (metrics + logs) |
| Workflow Automation | n8n |

## Project Structure

```
/
├── .infisical.json           # Infisical CLI config (safe to commit)
├── .env.staging              # Local backup only (gitignored)
├── docker-compose.yml        # Local development
├── deployment/
│   └── vm/                   # VM deployment configs
│       ├── docker-compose.yml   # Production services (Caddy, n8n, workers)
│       ├── Caddyfile            # Reverse proxy routes
│       ├── alloy-config.alloy   # Grafana Alloy config
│       └── scripts/             # Setup, cron, systemd scripts
├── grafana/
│   └── dashboards/           # Pre-built Grafana dashboards (JSON)
├── monitoring/
│   └── prometheus.yml        # Prometheus config (local dev)
├── instruction/              # All documentation
│   ├── rules/                # AI agent rules (auto-applied)
│   ├── skills/               # AI agent skills (on-demand)
│   ├── reference/            # Metrics spec, observability guide
│   ├── database/             # Schema, configuration
│   ├── architecture/         # Deployments, infrastructure, Infisical
│   ├── cli/                  # CLI commands (docker, grafana, azure, etc.)
│   ├── tasks/active/         # 🟡 PENDING tasks
│   ├── tasks/completed/      # ✅ DONE tasks
│   └── ai-agent/             # AI trading guides
├── services/
│   ├── ai/
│   │   └── ai-hub/           # Python/FastAPI AI gateway (systemd on host)
│   ├── back-office/          # Next.js admin UI (Docker on VM)
│   ├── common/
│   │   ├── StockTracker.Data/           # EF Core entities & DbContext
│   │   ├── StockTracker.Data.Migrations/ # Migration CLI tool
│   │   └── StockTracker.Common/         # Shared utilities (metrics, health)
│   ├── data-fetchers/
│   │   └── TwelveData/                  # Stock data worker (Docker on VM)
│   ├── frontend/                        # Next.js public app (Vercel)
│   └── metrics/                         # Metrics aggregation service (Docker on VM)
└── .github/workflows/
    └── deploy-vm.yml                    # VM deployment pipeline
```

## Important Notes

1. **Infisical is source of truth** - All secrets managed in Infisical Cloud, auto-sync to GitHub/Vercel
2. **Never commit secrets** - `.env.staging` is gitignored (kept as backup only)
3. **RLS is enabled** - `data_sources` requires service role key
4. **Local development** - Use `infisical run --env=prod -- <command>` to inject secrets
5. **10-min candle data** - 90 day retention for intraday analysis
6. **Supabase MCP available** - Use for database queries in AI conversations
7. **`.infisical.json` is safe to commit** - Only contains workspace ID, no secrets
8. **Caddy worker endpoints** - When adding new Caddy reverse proxy routes, update `instruction/cli/caddy/worker-endpoints.md`
9. **VM deployment** - Backend services run on Azure VM (`nx-linux-server-azure`), not Container Apps
10. **CLI documentation** - Detailed commands in `instruction/cli/` (PowerShell, Docker, Azure CLI)
11. **AI Hub runs on host** - Python service as systemd unit (not Docker) to access host CLIs; containers use `host.docker.internal:8084`
12. **Grafana Cloud** - Metrics/logs forwarded via Alloy; dashboards in `grafana/dashboards/`
13. **Back-office** - Admin UI at `/back-office` on VM; uses Supabase for data display + AI Hub integration
