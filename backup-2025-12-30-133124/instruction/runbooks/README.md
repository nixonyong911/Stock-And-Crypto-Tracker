# Runbooks

## Purpose

This folder contains **structural requirements and procedures for adding new components** to the Stock Tracker system. These are the MUST-DO interconnected pieces that ensure new workers/services integrate properly with the existing infrastructure.

## Why Runbooks?

When adding a new data-fetcher worker, it's not just "create worker + API = done". There are many interconnected requirements:

- Scheduled job configuration
- Metrics for monitoring  
- Back-office integration
- Environment variables (injected from Infisical, not .env)
- Grafana dashboard setup
- Caddy reverse proxy routes
- Database schema requirements

Runbooks document these structural requirements so nothing is missed.

## What Goes Here

| Type | Description | Example |
|------|-------------|---------|
| **Worker Requirements** | MUST-DO checklist for new workers | `data-fetcher-requirements.md` |
| **Integration Guides** | How components connect together | `metrics-integration.md` |
| **Infrastructure Setup** | VM, Docker, Caddy configurations | `caddy-route-setup.md` |

## Format Guidelines

Each runbook should include:

1. **Overview** - What this covers and why it's needed
2. **Prerequisites** - What must exist before starting
3. **Requirements Checklist** - All MUST-DO items
4. **Implementation Details** - How to implement each requirement
5. **Verification** - How to confirm everything works
6. **Related Documentation** - Links to architecture docs

## Naming Convention

`{component}-{type}.md`

Examples:
- `data-fetcher-requirements.md`
- `metrics-integration.md`
- `grafana-dashboard-setup.md`

## Current Runbooks

| Runbook | Description |
|---------|-------------|
| [data-fetcher-requirements.md](./data-fetcher-requirements.md) | Complete requirements for onboarding a new data-fetcher worker |

## Related Documentation

- [Architecture: Data-Fetcher & Back-Office Integration](../architecture/data-fetcher-backoffice-integration.md)
- [Metrics Specification](../reference/metrics-specification.md)
- [Caddy Worker Endpoints](../cli/caddy/worker-endpoints.md)


