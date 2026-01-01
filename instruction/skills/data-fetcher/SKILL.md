---
name: data-fetcher
description: Complete requirements and step-by-step guide for creating a new data-fetcher worker that integrates with the Stock Tracker system, including API endpoints, database registration, metrics, Grafana dashboard, and deployment.
triggers:
  - "create new data fetcher"
  - "add new worker"
  - "onboard new API"
  - "new data source"
  - "integrate external API"
---

# Data-Fetcher Worker Skill

## Overview

This skill guides you through creating a new data-fetcher worker that:
- Is discoverable by the back-office UI
- Has proper monitoring and metrics
- Can be configured without rebuilds
- Follows established patterns

**For detailed patterns, code examples, and verification commands**: See [Data-Fetcher Patterns Reference](../../reference/data-fetcher-patterns.md)

---

## Prerequisites

Before starting, ensure access to:
- [ ] Supabase project (database)
- [ ] Infisical (secrets)
- [ ] Azure VM (deployment)
- [ ] Grafana Cloud (dashboards)
- [ ] Understanding of the external API being integrated

---

## High-Level Workflow

```
1. API Endpoints     → Implement required REST endpoints
2. Database Setup    → Register worker, data source, schedule
3. Metrics          → Emit standard Prometheus metrics
4. Grafana          → Create monitoring dashboard
5. Infrastructure   → Configure Caddy, Docker, secrets, CI/CD
6. Documentation    → Update relevant docs
7. Verification     → Test pre and post deployment
```

---

## Step 1: Create API Endpoints

Every data-fetcher MUST implement:

| Endpoint | Purpose |
|----------|---------|
| `GET /health/live` | Liveness probe (200 if running) |
| `GET /health/ready` | Readiness check (200 if DB connected) |
| `GET /api/fetch/status` | Worker config and current status |
| `POST /api/fetch/trigger/{symbol}` | Manual single-symbol fetch |
| `POST /api/fetch/trigger/all` | Manual batch fetch |

**See response DTOs and examples**: [Data-Fetcher Patterns - API Endpoints](../../reference/data-fetcher-patterns.md#required-api-endpoints)

---

## Step 2: Database Registration

Register the worker in three tables:

1. **`worker_registry`** - Worker metadata and UI config schema
2. **`data_sources`** - External API URL and description
3. **`fetch_schedules`** - Cron schedule and fetch configuration

**See SQL templates**: [Data-Fetcher Patterns - Database Registration](../../reference/data-fetcher-patterns.md#database-registration-pattern)

---

## Step 3: Implement Metrics

Use `IMetricsClient` from `StockTracker.Common` to emit standard metrics:

| Metric | Type | Purpose |
|--------|------|---------|
| `worker_up` | gauge | Health indicator |
| `worker_info` | gauge | Version metadata |
| `fetch_operations_total` | counter | Fetch attempts (labeled by status) |
| `fetch_errors_total` | counter | Error counts (labeled by type) |
| `fetch_duration_seconds` | histogram | API latency distribution |
| `records_inserted_total` | counter | Data volume tracking |

**See code examples**: [Data-Fetcher Patterns - Metrics Implementation](../../reference/data-fetcher-patterns.md#metrics-implementation-pattern)

---

## Step 4: Create Grafana Dashboard

Create `grafana/dashboards/yourworker-details.json` with standard panels:
- Worker Status (up/down)
- Fetch Operations Rate
- Error Rate Percentage
- Records Inserted Over Time

**See panel queries**: [Data-Fetcher Patterns - Grafana Dashboard](../../reference/data-fetcher-patterns.md#grafana-dashboard-pattern)

---

## Step 5: Infrastructure Setup

### 5.1 Caddy Route

Add reverse proxy route to `deployment/vm/Caddyfile`:

```
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

### 5.2 Docker Compose Service

Add service to `deployment/vm/docker-compose.yml` with:
- Build context pointing to your Dockerfile
- Environment variables (DB connection, API keys, metrics URL, PATH_BASE)
- Health check using `/health/live` endpoint
- Network: `stock-tracker`

### 5.3 Secrets (Infisical)

Add API keys and credentials to Infisical `prod` environment.

### 5.4 CI/CD Trigger

Add path trigger to `.github/workflows/deploy-vm.yml`:
```yaml
paths:
  - 'services/data-fetchers/YourWorker/**'
```

**See full templates**: [Data-Fetcher Patterns - Infrastructure Setup](../../reference/data-fetcher-patterns.md#infrastructure-setup-pattern)

---

## Step 6: Documentation Updates

Update these files to include your new worker:
- [ ] `instruction/skills/cli-caddy/SKILL.md` - Add new route
- [ ] `services/data-fetchers/README.md` - List new worker
- [ ] `services/data-fetchers/YourWorker/README.md` - Create worker-specific docs

---

## Step 7: Verification

### Pre-Deployment Checklist

- [ ] Worker builds successfully
- [ ] Health endpoints respond (200 OK)
- [ ] Fetch endpoints work with test data
- [ ] Metrics are emitted to Metrics service
- [ ] Database entries created (worker_registry, data_sources, fetch_schedules)

### Post-Deployment Testing

```bash
# Quick health check
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/health/live

# Test single symbol fetch
curl -X POST https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/api/fetch/trigger/AAPL

# Verify in back-office UI
# Navigate to /back-office/data-fetchers
```

**See full verification commands and SQL queries**: [Data-Fetcher Patterns - Verification](../../reference/data-fetcher-patterns.md#verification-checklist)

---

## Common Pitfalls

1. **Forgot PATH_BASE** - Causes 404 errors in Docker
   - Solution: Add `PATH_BASE=/api/yourworker` environment variable

2. **Metrics not appearing** - Worker metrics isolated
   - Solution: Ensure `Metrics__ServiceUrl=http://metrics:8080` is set

3. **Health checks failing** - Caddy strips path prefix
   - Solution: Use `handle_path` instead of `handle` in Caddyfile

4. **Database connection timeout** - Async without ConfigureAwait
   - Solution: Use `ConfigureAwait(false)` in library code

5. **Back-office not discovering worker** - Missing worker_registry entry
   - Solution: Verify `worker_registry` SQL was executed

---

## Related

### Reference & Architecture
- [Data-Fetcher Patterns Reference](../../reference/data-fetcher-patterns.md) - Full patterns and examples
- [Data-Fetcher Architecture](../../architecture/data-fetcher-backoffice-integration.md) - System design
- [Metrics Specification](../../reference/metrics-specification.md) - Metrics naming and labels
- [Infrastructure Config](../../reference/infrastructure-config.md) - VM and service details
- [Infisical Secrets Management](../../architecture/infisical-secrets-management.md) - Secret handling

### Rules & Conventions
- [C# Conventions](../../rules/conventions/csharp.md) - Coding standards for .NET
- [Docker Conventions](../../rules/conventions/docker.md) - Container best practices
- [Security Best Practices](../../rules/security.md) - Secret management, input validation
- [CI/CD Deployment](../../rules/cicd-deployment.md) - Adding workers to pipeline
