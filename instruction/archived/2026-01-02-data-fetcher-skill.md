---
⚠️ **DEPRECATED** - This document is no longer maintained
- **Deprecated Date**: 2026-01-02
- **Reason**: Replaced by generic creating-new-worker skill (supports all worker types)
- **Replacement**: See [creating-new-worker/SKILL.md](../skills/creating-new-worker/SKILL.md)
---

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

[Original content preserved for historical reference - see replacement skill for current guidance]





