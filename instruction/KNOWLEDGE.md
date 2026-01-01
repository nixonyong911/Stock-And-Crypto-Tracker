# Project Knowledge State

**Last Updated**: 2026-01-01
**Updated By**: Rules to Skills Migration

---

## Active Components

| Component | Service Type | Status | Last Change | Notes |
|-----------|--------------|--------|-------------|-------|
| TwelveData Worker | data-fetcher | ✅ Running | 2025-12-30 | Stock data fetcher on VM (Docker) |
| Candlestick Analysis | analysis | ⏳ Ready | 2026-01-01 | Daily candlestick pattern analyzer (Docker) |
| n8n | workflow | ✅ Running | 2025-12-27 | Workflow automation on VM (Docker) |
| Caddy | reverse-proxy | ✅ Running | 2025-12-27 | Auto HTTPS reverse proxy (Docker) |
| Back-Office | frontend | ✅ Running | 2025-12-30 | Admin UI on VM (Docker) |
| Frontend | frontend | ✅ Running | 2025-12-27 | Main Next.js app (Vercel) |
| Metrics Service | metrics | ✅ Running | 2025-12-27 | Metrics aggregation API (Docker) |
| Grafana Alloy | observability | ✅ Running | 2025-12-27 | Metrics & logs forwarder to Grafana Cloud |
| AI Hub | ai | ✅ Running | 2025-12-29 | AI Gateway (systemd on VM host) |

---

## Recent Learnings

| Date | Learning |
|------|----------|
| 2026-01-01 | Migrated 3 procedural rules to skills: cli-vm, task-workflow, doc-archiver (~680 lines reduced from rules) |
| 2026-01-01 | Candlestick Analysis Worker: aggregates 15-min candles to daily, detects 8 single-candle patterns |
| 2026-01-01 | Database migrations via Supabase MCP `apply_migration` (not EF Core history table) |
| 2025-12-31 | Reorganized instruction/: rules = project LAWS (always applied), skills = lazy-loaded (on-demand) |
| 2025-12-31 | CLI docs migrated to skills/cli-*/SKILL.md format for on-demand loading |
| 2025-12-31 | Created rules-keeper skill for auto-updating rules when code changes |
| 2025-12-31 | CI/CD fix: Docker image loading must use explicit filenames, not `/tmp/*.tar.gz` glob (prevents loading unrelated tarballs) |
| 2025-12-30 | PostgreSQL TIME columns map to `TimeSpan` in C# with Dapper (not `TimeOnly`) |
| 2025-12-30 | Next.js `NEXT_PUBLIC_*` env vars must be available at build time (use Docker build args) |
| 2025-12-30 | Next.js `basePath` handles prefixing automatically - don't manually prefix links |
| 2025-12-30 | Supabase publishable key full format: `sb_publishable_xxx-yyy` |
| 2025-12-30 | Stock market data not available on weekends/holidays - test with trading day dates |
| 2025-12-30 | Back-Office worker management UI implemented with dynamic sidebar |
| 2025-12-27 | VM migration from Container Apps completed |
| 2025-12-27 | Infisical Machine Identity configured for VM secrets |

---

## Pending Patterns to Document

- [ ] Python FastAPI service patterns (when AI Hub is active)
- [ ] Metrics aggregation patterns (when Metrics service is active)

---

## Available Skills

### Core Skills

| Skill | Triggers | Use When |
|-------|----------|----------|
| [knowledge-keeper](skills/knowledge-keeper/SKILL.md) | "update knowledge", "finish task" | Extracting learnings, managing tasks |
| [skill-creator](skills/skill-creator/SKILL.md) | "create skill", "new skill" | Creating new spec-compliant skills |
| [rules-keeper](skills/rules-keeper/SKILL.md) | "update rules", "architecture changed" | Updating rules when code changes |
| [data-fetcher](skills/data-fetcher/SKILL.md) | "new worker", "new data fetcher" | Creating new data-fetcher workers |
| [task-workflow](skills/task-workflow/SKILL.md) | "manage tasks", "complete task" | Task lifecycle management |
| [doc-archiver](skills/doc-archiver/SKILL.md) | "deprecate doc", "archive docs" | Documentation deprecation workflow |

### CLI Skills (Lazy-Loaded)

| Skill | Triggers | Use When |
|-------|----------|----------|
| [cli-vm](skills/cli-vm/SKILL.md) | "check vm", "ssh azure" | VM connection and service management |
| [cli-docker](skills/cli-docker/SKILL.md) | "docker commands" | Managing containers |
| [cli-caddy](skills/cli-caddy/SKILL.md) | "worker endpoints", "caddy routes" | Service URLs, proxy config |
| [cli-grafana](skills/cli-grafana/SKILL.md) | "grafana cli", "export dashboard" | Managing Grafana dashboards |
| [cli-infisical](skills/cli-infisical/SKILL.md) | "infisical cli", "run with secrets" | Secrets management |
| [cli-powershell](skills/cli-powershell/SKILL.md) | "ssh-azure", "powershell functions" | Custom shell functions |
| [cli-vercel](skills/cli-vercel/SKILL.md) | "vercel deploy" | Frontend deployment |
| [cli-github](skills/cli-github/SKILL.md) | "gh workflow", "trigger deployment" | GitHub Actions management |
| [cli-oracle](skills/cli-oracle/SKILL.md) | "oracle cli", "oci commands" | Oracle Cloud management |
| [cli-ai](skills/cli-ai/SKILL.md) | "claude cli", "cursor agent cli" | AI coding agents |

---

## Quick Reference

### Service URLs

| Service | URL |
|---------|-----|
| n8n | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| Candlestick Analysis | https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/swagger |
| Back-Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office |
| Frontend | https://stock-tracker.vercel.app/ |

### Commands

| Command | Purpose |
|---------|---------|
| `/finish-task` | Move completed tasks to `tasks/completed/` |
| `/knowledge-update` | Extract learnings from conversation → update this file |

---

## Related

- [Rules](rules/) - Project-wide laws (always applied)
- [Skills](skills/) - Repeatable task instructions (lazy-loaded)
- [Tasks](tasks/) - Active and completed work
- [Architecture](architecture/) - Service-specific design docs

