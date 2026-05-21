# Stock and Crypto Tracker - Project Context

## Project Overview

A microservices-based stock and cryptocurrency tracking application with:
- **Frontend**: Next.js on Vercel (public-facing)
- **Back-office**: Next.js admin UI on Azure VM (internal tools)
- **Backend**: .NET 8 workers + TypeScript AI services on Azure VM (Docker + Caddy)
- **Database**: Self-hosted PostgreSQL 17 on Azure VM (Supabase is a daily backup mirror only)
- **Observability**: Grafana Cloud (metrics + logs via Alloy)
- **Purpose**: Fetch market data, store 10-min candles, enable AI trading analysis

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, TypeScript, Supabase Client (Vercel) |
| Back-office | Next.js 16, TypeScript, Tailwind, shadcn/ui (VM) |
| Backend Workers | .NET 8, Dapper, ASP.NET Core |
| AI Services | TypeScript, Fastify (gateway-2.0 in Docker) |
| Database | Self-hosted PostgreSQL 17 (VM Docker), SQL migrations in data-fetcher-2.0/migrations/ |
| Shared Library | StockTracker.Common (utilities) |
| CI/CD | GitHub Actions → SSH → Azure VM |
| Reverse Proxy | Caddy (auto HTTPS via Let's Encrypt) |
| Observability | Grafana Cloud, Grafana Alloy (metrics + logs) |
| Workflow Automation | n8n |

## Project Structure

```
/
├── .infisical.json           # Infisical CLI config (safe to commit)
├── .env.staging              # Local backup only (gitignored)
├── deployment/
│   └── vm/                   # VM deployment configs
│       ├── docker-compose.yml   # All services (Caddy, n8n, workers)
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
│   │   └── gateway-2.0/      # TypeScript AI gateway (Docker on VM)
│   ├── back-office/          # Next.js admin UI (Docker on VM)
│   ├── common/
│   │   └── StockTracker.Common/         # Shared utilities (metrics, health)
│   ├── workers/                         # All worker services
│   │   └── data-fetcher-2.0/           # Unified data fetcher (Alpaca, Finnhub, FRED, Massive, CandlestickAnalysis)
│   │       └── migrations/             # SQL migrations (replaces EF Core)
│   ├── frontend/                        # Next.js public app (Vercel)
│   └── metrics/                         # Metrics aggregation service (Docker on VM)
└── .github/workflows/
    └── deploy-vm.yml                    # VM deployment pipeline
```

## Important Notes

1. **Security is critical** - Follow [Security Best Practices](./security.md) for all code changes (secrets, input validation, auth, OWASP Top 10)
2. **Infisical is source of truth** - All secrets managed in Infisical Cloud, auto-sync to GitHub/Vercel
3. **Never commit secrets** - `.env.staging` is gitignored (kept as backup only); use placeholders in `.env.example`
4. **RLS is enabled** - `data_sources` requires service role key
5. **Local development** - Use `infisical run --env=prod -- <command>` to inject secrets
6. **10-min candle data** - 90 day retention for intraday analysis
7. **Database queries** - Use VM Postgres (`docker exec postgres psql ...`) for live data; Supabase is a daily backup mirror only
8. **`.infisical.json` is safe to commit** - Only contains workspace ID, no secrets
9. **Caddy worker endpoints** - When adding new Caddy reverse proxy routes, update `instruction/skills/cli-caddy/SKILL.md`
10. **VM deployment** - Backend services run on Azure VM (`nx-linux-server-azure`), not Container Apps
11. **CLI documentation** - Detailed commands in `instruction/cli/` (PowerShell, Docker, Azure CLI)
12. **Gateway 2.0 in Docker** - TypeScript AI gateway as Docker container with volume mounts to access host CLIs; containers use `gateway-2.0:8080`
13. **Grafana Cloud** - Metrics/logs forwarded via Alloy; dashboards in `grafana/dashboards/`
14. **Back-office** - Admin UI at `/back-office` on VM; uses Supabase for data display + AI Hub integration
