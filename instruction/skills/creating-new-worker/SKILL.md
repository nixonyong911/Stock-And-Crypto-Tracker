---
name: creating-new-worker
description: Step-by-step guide for creating a new worker (data-fetcher, analysis) with all required integrations - API endpoints, database, metrics, Grafana dashboard, CI/CD pipeline, and deployment verification.
triggers:
  - "create new worker"
  - "add new worker"
  - "creating new worker"
  - "new data fetcher"
  - "new analysis worker"
---

# Creating New Worker Skill

## Overview

This skill guides AI agents through creating a new worker that integrates with the Stock Tracker system.

**Worker Types:**
- `data-fetcher` - Fetches external API data (e.g., TwelveData, CoinGecko)
- `analysis` - Processes existing data (e.g., CandlestickAnalysis)

**Every worker MUST include:**
- Health endpoints (`/health/live`, `/health/ready`)
- Swagger documentation
- Metrics emission
- Grafana dashboard
- CI/CD pipeline integration
- Database registration

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

Create `grafana/dashboards/yourworker-details.json` with panels:

- Worker Status (up/down)
- Operations Rate
- Error Rate Percentage
- Records Processed Over Time

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

### 10-Minute Offset Rule

Workers of the same type should be scheduled 10 minutes apart to avoid:
- API rate limit conflicts
- Database connection spikes
- Resource contention

**Pattern:**
```
data-fetcher-1: 22:00 UTC (e.g., TwelveData)
data-fetcher-2: 22:10 UTC (new worker)
data-fetcher-3: 22:20 UTC (future worker)

analysis-1:     22:30 UTC (e.g., CandlestickAnalysis)
analysis-2:     22:40 UTC (new analysis worker)
```

**Find next available slot:**

```sql
SELECT name, schedule_time_utc 
FROM fetch_schedules 
WHERE is_enabled = true 
ORDER BY schedule_time_utc;
```

**Register new schedule via Supabase MCP:**

```sql
-- First, insert data source
INSERT INTO data_sources (name, api_url, description)
VALUES ('YourWorker', 'https://api.example.com', 'Description');

-- Then, insert schedule
INSERT INTO fetch_schedules (
    data_source_id, name, description, 
    schedule_time_utc, is_enabled, fetch_config
)
VALUES (
    (SELECT id FROM data_sources WHERE name = 'YourWorker'),
    'YourWorker Daily',
    'Daily fetch at market close',
    '22:10:00',  -- 10 min after previous worker
    true,
    '{"interval": "15min", "outputSize": 30}'::jsonb
);
```

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

## Infrastructure Files to Update

| File | Update |
|------|--------|
| `deployment/vm/docker-compose.yml` | Add service definition |
| `deployment/vm/Caddyfile` | Add reverse proxy route |
| `.github/workflows/deploy-vm.yml` | Add CI/CD triggers |
| `instruction/KNOWLEDGE.md` | Add service URL |
| `instruction/skills/cli-caddy/SKILL.md` | Add route reference |

---

## Related Documentation

### Reference Files
- [API Endpoints](references/api-endpoints/REFERENCE.md)
- [Database Setup](references/database-setup/REFERENCE.md)
- [Metrics Integration](references/metrics-integration/REFERENCE.md)
- [Grafana Dashboard](references/grafana-dashboard/REFERENCE.md)
- [CI/CD Pipeline](references/cicd-pipeline/REFERENCE.md)
- [Verification](references/verification/REFERENCE.md)
- [Coding Standards](references/coding-standards/REFERENCE.md)

### Architecture & Rules
- [Data-Fetcher Architecture](../../architecture/data-fetcher-backoffice-integration.md)
- [Metrics Architecture](../../architecture/metrics-architecture.md)
- [Security Rules](../../rules/security.md)
- [C# Conventions](../../rules/conventions/csharp.md)
- [Docker Conventions](../../rules/conventions/docker.md)
- [CI/CD Deployment](../../rules/cicd-deployment.md)
