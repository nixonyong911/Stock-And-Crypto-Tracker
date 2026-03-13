# Project Knowledge State

**Last Updated**: 2026-01-02
**Updated By**: Worker Folder Consolidation

---

## Active Components

| Component         | Service Type  | Status     | Last Change | Notes                                                                                           |
| ----------------- | ------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------- |
| Data Fetcher 2.0  | data-fetcher  | ✅ Running | 2026-03-13  | `services/workers/data-fetcher-2.0/` (Alpaca, Finnhub, FRED, Massive, CandlestickAnalysis providers) |
| n8n               | workflow      | ✅ Running | 2025-12-27  | Workflow automation on VM (Docker)                                                              |
| Caddy             | reverse-proxy | ✅ Running | 2025-12-27  | Auto HTTPS reverse proxy (Docker)                                                               |
| Back-Office       | frontend      | ✅ Running | 2025-12-30  | Admin UI on VM (Docker)                                                                         |
| Frontend          | frontend      | ✅ Running | 2025-12-27  | Main Next.js app (Vercel)                                                                       |
| Metrics Service   | metrics       | ✅ Running | 2025-12-27  | Metrics aggregation API (Docker)                                                                |
| Grafana Alloy     | observability | ✅ Running | 2025-12-27  | Metrics & logs forwarder to Grafana Cloud                                                       |
| AI Hub            | ai            | ✅ Running | 2025-12-29  | AI Gateway (systemd on VM host)                                                                 |

---

## Recent Learnings

| Date       | Learning                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-13 | Consolidated: TwelveData, fred-worker (Go), StockTracker.Data, StockTracker.Data.Migrations all deleted; data-fetcher-2.0 is the single worker with SQL migrations, Dapper entities, and providers for Alpaca, Finnhub, FRED, Massive, CandlestickAnalysis |
| 2026-03-13 | FRED endpoints served via data-fetcher-2.0 under /api/fred/* (Caddy `handle`, not `handle_path`)                           |
| 2026-01-02 | Workers consolidated: `services/workers/{type}/{name}/` structure (data-fetcher, analysis)                                  |
| 2026-01-02 | Skill renamed: `creating-new-worker` → `worker-requirements` (standard for new AND existing workers)                        |
| 2026-01-02 | Archived data-fetcher skill, data-fetcher-patterns.md, worker-metrics-implementation.md (replaced by worker-requirements)   |
| 2026-01-01 | Created creating-new-worker skill with 7 focused reference files (~4100 tokens total)                                       |
| 2026-01-01 | Migrated 3 procedural rules to skills: cli-vm, task-workflow, doc-archiver (~680 lines reduced from rules)                  |
| 2026-01-01 | Candlestick Analysis Worker: aggregates 15-min candles to daily, detects 8 single-candle patterns                           |
| 2026-01-01 | Database migrations via Supabase MCP `apply_migration` (not EF Core history table)                                          |
| 2025-12-31 | Reorganized instruction/: rules = project LAWS (always applied), skills = lazy-loaded (on-demand)                           |
| 2025-12-31 | CLI docs migrated to skills/cli-\*/SKILL.md format for on-demand loading                                                    |
| 2025-12-31 | Created rules-keeper skill for auto-updating rules when code changes                                                        |
| 2025-12-31 | CI/CD fix: Docker image loading must use explicit filenames, not `/tmp/*.tar.gz` glob (prevents loading unrelated tarballs) |
| 2025-12-30 | PostgreSQL TIME columns map to `TimeSpan` in C# with Dapper (not `TimeOnly`)                                                |
| 2025-12-30 | Next.js `NEXT_PUBLIC_*` env vars must be available at build time (use Docker build args)                                    |
| 2025-12-30 | Next.js `basePath` handles prefixing automatically - don't manually prefix links                                            |
| 2025-12-30 | Supabase publishable key full format: `sb_publishable_xxx-yyy`                                                              |
| 2025-12-30 | Stock market data not available on weekends/holidays - test with trading day dates                                          |
| 2025-12-30 | Back-Office worker management UI implemented with dynamic sidebar                                                           |
| 2025-12-27 | VM migration from Container Apps completed                                                                                  |
| 2025-12-27 | Infisical Machine Identity configured for VM secrets                                                                        |

---

## Pending Patterns to Document

- [ ] Python FastAPI service patterns (when AI Hub is active)
- [ ] Metrics aggregation patterns (when Metrics service is active)

---

## Available Skills

### Core Skills

| Skill                                                      | Triggers                                                  | Use When                             |
| ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| [knowledge-keeper](skills/knowledge-keeper/SKILL.md)       | "update knowledge", "finish task"                         | Extracting learnings, managing tasks |
| [skill-creator](skills/skill-creator/SKILL.md)             | "create skill", "new skill"                               | Creating new spec-compliant skills   |
| [rules-keeper](skills/rules-keeper/SKILL.md)               | "update rules", "architecture changed"                    | Updating rules when code changes     |
| [worker-requirements](skills/worker-requirements/SKILL.md) | "create new worker", "review worker", "worker compliance" | Worker standard (create & review)    |
| [task-workflow](skills/task-workflow/SKILL.md)             | "manage tasks", "complete task"                           | Task lifecycle management            |
| [doc-archiver](skills/doc-archiver/SKILL.md)               | "deprecate doc", "archive docs"                           | Documentation deprecation workflow   |

### CLI Skills (Lazy-Loaded)

| Skill                                                       | Triggers                                                | Use When                                               |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| [cli](skills/cli/SKILL.md)                                  | "docker commands", "infisical cli", "gh workflow", etc. | Unified CLI skill - see References/ for specific tools |
| [vm](skills/cli/References/vm/REFERENCE.md)                 | "check vm", "ssh azure"                                 | VM connection and service management                   |
| [docker](skills/cli/References/docker/REFERENCE.md)         | "docker commands"                                       | Managing containers                                    |
| [caddy](skills/cli/References/caddy/REFERENCE.md)           | "worker endpoints", "caddy routes"                      | Service URLs, proxy config                             |
| [grafana](skills/cli/References/grafana/REFERENCE.md)       | "grafana cli", "export dashboard"                       | Managing Grafana dashboards                            |
| [infisical](skills/cli/References/infisical/REFERENCE.md)   | "infisical cli", "run with secrets"                     | Secrets management                                     |
| [powershell](skills/cli/References/powershell/REFERENCE.md) | "ssh-azure", "powershell functions"                     | Custom shell functions                                 |
| [vercel](skills/cli/References/vercel/REFERENCE.md)         | "vercel deploy"                                         | Frontend deployment                                    |
| [github](skills/cli/References/github/REFERENCE.md)         | "gh workflow", "trigger deployment"                     | GitHub Actions management                              |
| [oracle](skills/cli/References/oracle/REFERENCE.md)         | "oracle cli", "oci commands"                            | Oracle Cloud management                                |
| [ai](skills/cli/References/ai/REFERENCE.md)                 | "claude cli", "cursor agent cli"                        | AI coding agents                                       |

---

## Quick Reference

### Service URLs

| Service                              | URL                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| n8n                                  | https://nxserver.malaysiawest.cloudapp.azure.com/                             |
| Data Fetcher 2.0 (includes Analysis) | https://nxserver.malaysiawest.cloudapp.azure.com/api/data-fetcher-2.0/swagger |
| FRED API (via Data Fetcher 2.0)      | https://nxserver.malaysiawest.cloudapp.azure.com/api/fred/*                   |
| Back-Office                          | https://nxserver.malaysiawest.cloudapp.azure.com/back-office                  |
| Frontend                             | https://stock-tracker.vercel.app/                                             |

### Commands

| Command             | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `/finish-task`      | Move completed tasks to `tasks/completed/`             |
| `/knowledge-update` | Extract learnings from conversation → update this file |

---

## Related

- [Rules](rules/) - Project-wide laws (always applied)
- [Skills](skills/) - Repeatable task instructions (lazy-loaded)
- [Tasks](tasks/) - Active and completed work
- [Architecture](architecture/) - Service-specific design docs
