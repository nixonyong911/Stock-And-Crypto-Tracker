---
name: cli
description: Command-line interface tools for development, deployment, and infrastructure management. Use when working with Docker, secrets, GitHub workflows, Grafana dashboards, VM operations, or other CLI-based tasks.
triggers:
  - "docker commands"
  - "docker compose"
  - "start containers"
  - "view docker logs"
  - "rebuild container"
  - "infisical cli"
  - "run with secrets"
  - "view secrets"
  - "infisical commands"
  - "github cli"
  - "gh workflow"
  - "trigger deployment"
  - "check workflow"
  - "grafana cli"
  - "grafanactl"
  - "export dashboard"
  - "deploy dashboard"
  - "grafana commands"
  - "caddy endpoints"
  - "worker urls"
  - "service endpoints"
  - "add caddy route"
  - "reverse proxy"
  - "powershell functions"
  - "ssh azure"
  - "ssh-azure"
  - "profile functions"
  - "vercel deploy"
  - "deploy frontend"
  - "vercel cli"
  - "oracle cli"
  - "oci commands"
  - "create oracle vm"
  - "oracle cloud"
  - "claude cli"
  - "cursor agent cli"
  - "ai cli"
  - "code agent"
  - "check vm"
  - "connect to vm"
  - "vm status"
  - "check services"
---

# CLI Skill

> **⚠️ DEPRECATED**: This skill has been split into two focused skills for better auto-detection and usability:
> - **[devops-tools](../devops-tools/SKILL.md)** - For VM operations, deployments, service management, and troubleshooting
> - **[credentials-connections](../credentials-connections/SKILL.md)** - For SSH authentication, Infisical secrets, and service tokens
>
> This skill will be removed in a future update. Please use the new skills instead.

## Overview

Unified CLI skill for all command-line tools used in the Stock Tracker project. This skill provides quick access to CLI commands for development, deployment, secrets management, infrastructure operations, and monitoring.

---

## When to Use Each CLI Tool

### Docker
**Use when:** Managing containers, viewing logs, rebuilding services, or working with docker-compose.

**Reference:** [references/docker/REFERENCE.md](references/docker/REFERENCE.md)

---

### Infisical
**Use when:** Running services with secrets injected, viewing secret values, or managing secrets locally.

**Reference:** [references/infisical/REFERENCE.md](references/infisical/REFERENCE.md)

---

### GitHub CLI
**Use when:** Triggering deployments, checking workflow status, or managing GitHub Actions workflows.

**Reference:** [references/github/REFERENCE.md](references/github/REFERENCE.md)

---

### Grafana CLI
**Use when:** Exporting dashboards, deploying dashboards, or managing Grafana Cloud resources.

**Reference:** [references/grafana/REFERENCE.md](references/grafana/REFERENCE.md)

---

### Caddy
**Use when:** Checking service URLs, adding new routes, or debugging reverse proxy issues.

**Reference:** [references/caddy/REFERENCE.md](references/caddy/REFERENCE.md)

---

### PowerShell
**Use when:** Using custom shell functions like `ssh-azure` or running cursor-agent via WSL.

**Reference:** [references/powershell/REFERENCE.md](references/powershell/REFERENCE.md)

---

### Vercel
**Use when:** Deploying the Next.js frontend to Vercel manually.

**Reference:** [references/vercel/REFERENCE.md](references/vercel/REFERENCE.md)

---

### Oracle Cloud
**Use when:** Creating VMs or managing Oracle Cloud infrastructure resources.

**Reference:** [references/oracle/REFERENCE.md](references/oracle/REFERENCE.md)

---

### AI CLI
**Use when:** Running AI agents from command line for code review, generation, or automation (Claude Code, Cursor Agent).

**Reference:** [references/ai/REFERENCE.md](references/ai/REFERENCE.md)

---

### Azure VM
**Use when:** Checking VM status, connecting to VM, managing services, or performing health checks.

**Reference:** [references/vm/REFERENCE.md](references/vm/REFERENCE.md)

---

## All References

- [Docker](references/docker/REFERENCE.md) - Container management
- [Infisical](references/infisical/REFERENCE.md) - Secrets management
- [GitHub](references/github/REFERENCE.md) - Workflow management
- [Grafana](references/grafana/REFERENCE.md) - Dashboard management
- [Caddy](references/caddy/REFERENCE.md) - Reverse proxy and endpoints
- [PowerShell](references/powershell/REFERENCE.md) - Custom shell functions
- [Vercel](references/vercel/REFERENCE.md) - Frontend deployment
- [Oracle](references/oracle/REFERENCE.md) - Oracle Cloud management
- [AI](references/ai/REFERENCE.md) - AI coding agents
- [VM](references/vm/REFERENCE.md) - Azure VM operations

