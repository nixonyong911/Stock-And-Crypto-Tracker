---
name: worker-requirements
description: Guide for creating/reviewing workers in /services/workers
triggers:
  - "create worker"
  - "review worker"
  - "worker compliance"
---

# Worker Requirements

## Overview

This skill defines the **project standard** for all workers in the project. Use this for:
- **Creating new workers** - Follow the step-by-step guide
- **Reviewing existing workers** - Use the compliance checklist
- **Maintaining workers** - Reference requirements during updates

**Worker Location:** `services/workers/{type}/{name}/`

**Worker Types:**
- `data-fetcher` - Fetches external API data (e.g., TwelveData, CoinGecko)
  - Location: `services/workers/data-fetcher/{name}/`
- `analysis` - Processes existing data (e.g., CandlestickAnalysis)
  - Location: `services/workers/analysis/{name}/`

---

## Worker Type Confirmation

**If user doesn't specify worker type, prompt with:**

```
What type of worker would you like to create/review?
1. data-fetcher worker - Fetches external API data (e.g., TwelveData, CoinGecko)
2. analysis worker - Processes existing data (e.g., CandlestickAnalysis)
3. New type of worker - Define a new worker category
```

---

## Required Components

**Every worker MUST include:**
- Health endpoints (`/health/live`, `/health/ready`)
- Swagger documentation
- Metrics emission
- Grafana dashboard
- CI/CD pipeline integration
- Database registration

---

## Prerequisites

Before starting, ensure access to:
- [ ] Supabase project (database)
- [ ] Infisical (secrets management)
- [ ] Azure VM (deployment target)
- [ ] Grafana Cloud (dashboards)
- [ ] Understanding of the external API being integrated

---

## Database Access

Use Supabase MCP tools for any database queries, verification, or migrations.

---

## High-Level Workflow

```
1. API Endpoints     → Implement required REST endpoints + Swagger
2. Database Setup    → Entity, DbContext, migration via Supabase MCP
3. Secrets Config    → Add env vars to docker-compose.yml
4. Metrics           → Emit standard Prometheus metrics
5. Grafana Dashboard → Create worker-specific dashboard
6. CI/CD Pipeline    → Add build/deploy triggers
7. Schedule Config   → Register in fetch_schedules (10min offset)
8. Verification      → Pre/post deployment checks
```

---

## Step 1: API Endpoints

Every worker MUST implement:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health/live` | GET | Liveness probe (200 if running) |
| `/health/ready` | GET | Readiness check (200 if DB connected) |
| `/api/{worker}/status` | GET | Worker config and status |
| `/api/{worker}/trigger/{id}` | POST | Manual single-item trigger |
| `/api/{worker}/trigger/all` | POST | Manual batch trigger |

**Technical details:** [API Endpoints Reference](references/api-endpoints/REFERENCE.md)

---

## Step 2: Database Setup

If worker requires new tables:

1. Create entity class in `services/common/StockTracker.Data/Entities/`
2. Add `DbSet<>` to `StockTrackerDbContext.cs`
3. Create configuration in `Configurations/` folder
4. Apply migration via Supabase MCP `apply_migration`

**Technical details:** [Database Setup Reference](references/database-setup/REFERENCE.md)

---

## Step 3: Secrets Configuration

Secrets are injected at runtime via docker-compose environment variables.

**Add to `deployment/vm/docker-compose.yml`:**

```yaml
yourworker:
  environment:
    - ConnectionStrings__DefaultConnection=${DATABASE_CONNECTION_STRING}
    - YourWorker__ApiKey=${YOUR_WORKER_API_KEY}
    - MetricsService__BaseUrl=http://metrics:8080
    - PATH_BASE=/api/yourworker
```

**Add secrets to Infisical** `prod` environment:
- `YOUR_WORKER_API_KEY`
- Any other API credentials

---

## Step 4: Metrics Implementation

Use `IMetricsClient` from `StockTracker.Common` to emit standard metrics:

| Metric | Type | Purpose |
|--------|------|---------|
| `worker_up` | gauge | Health indicator (1=up) |
| `worker_info` | gauge | Version metadata |
| `fetch_operations_total` | counter | Operation attempts |
| `fetch_errors_total` | counter | Error counts by type |
| `fetch_duration_seconds` | histogram | API latency |
| `records_inserted_total` | counter | Data volume |

**Technical details:** [Metrics Integration Reference](references/metrics-integration/REFERENCE.md)

---

## Step 5: Grafana Dashboard

1. Create `grafana/dashboards/yourworker-details.json` (copy from existing)
2. Upload to Grafana Cloud via API
3. Verify dashboard accessible

**Technical details:** [Grafana Dashboard Reference](references/grafana-dashboard/REFERENCE.md)

---

## Step 6: CI/CD Pipeline Integration

Add worker to `.github/workflows/deploy-vm.yml`:

1. Add trigger path
2. Add change detection filter
3. Add build step with caching
4. Add compression block
5. Add to image loading list

**Technical details:** [CI/CD Pipeline Reference](references/cicd-pipeline/REFERENCE.md)

---

## Step 7: Schedule Configuration

Database-driven scheduling via `fetch_schedules` table. **10-minute offset rule:** Schedule workers 10min apart.

```sql
INSERT INTO data_sources (name, base_url, description, is_active)
VALUES ('YourWorker', 'https://api.example.com', 'Description', true);

INSERT INTO fetch_schedules (data_source_id, name, schedule_time_utc, is_enabled)
VALUES ((SELECT id FROM data_sources WHERE name = 'YourWorker'), 'YourWorker Daily', '22:10:00', true);
```

**Technical details:** [Scheduling Reference](references/scheduling/REFERENCE.md)

---

## Step 8: Verification

### Pre-Deployment Checklist

- [ ] Worker builds successfully (`dotnet build`)
- [ ] Health endpoints respond (200 OK)
- [ ] Swagger UI accessible at `/api/yourworker/swagger`
- [ ] Metrics emitted to Metrics service
- [ ] Database entries created (data_sources, fetch_schedules)
- [ ] Grafana dashboard JSON created

### Post-Deployment Verification

- [ ] Container running (`docker ps | grep yourworker`)
- [ ] Health endpoint accessible via public URL
- [ ] Trigger endpoints work
- [ ] Metrics visible in Grafana

**Technical details:** [Verification Reference](references/verification/REFERENCE.md)

---

## Coding Standards

Workers MUST follow:

- **Security**: No secrets in code, parameterized queries, input validation
- **Fault Tolerance**: Retry with exponential backoff, timeouts, graceful degradation
- **Conventions**: C# naming, structured logging, async patterns

**Technical details:** [Coding Standards Reference](references/coding-standards/REFERENCE.md)

---

## Reviewing Existing Workers

Use this checklist when reviewing or auditing existing workers for compliance:

### Compliance Checklist

| Requirement | Check | Location |
|-------------|-------|----------|
| Health endpoints | `/health/live` and `/health/ready` respond 200 | `Controllers/` |
| Swagger docs | UI accessible at `/api/{worker}/swagger` | `Program.cs` |
| Metrics emission | Uses `IMetricsClient` from `StockTracker.Common` | `Services/` |
| Grafana dashboard | JSON exists AND uploaded to Grafana Cloud | Dashboard file + API |
| CI/CD integration | Paths in `deploy-vm.yml` triggers | Workflow file |
| Database registration | Entry in `data_sources` table | Supabase |
| Schedule registration | Entry in `fetch_schedules` table | Supabase |
| Secrets via Infisical | No hardcoded secrets | `appsettings.json` |
| Docker health check | `HEALTHCHECK` in Dockerfile | `Dockerfile` |
| PATH_BASE configured | Environment variable set | `docker-compose.yml` |

**Common Issues:** See [Troubleshooting Reference](references/troubleshooting/REFERENCE.md)

---

## Step 9: Documentation Updates

Update: `docker-compose.yml`, `Caddyfile`, `deploy-vm.yml`, `KNOWLEDGE.md`

---

## Related

All technical details in `references/` folder. Architecture docs in `instruction/architecture/`.
