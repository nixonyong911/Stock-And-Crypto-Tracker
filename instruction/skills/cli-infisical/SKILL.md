---
name: cli-infisical
description: Infisical CLI for secrets management and local development. Use when running services with secrets or viewing secret values.
triggers:
  - "infisical cli"
  - "run with secrets"
  - "view secrets"
  - "infisical commands"
---

# Infisical CLI Skill

## Overview

Infisical CLI commands for running services with secrets injected and managing secrets locally.

---

## Decision Tree: Adding New Secrets

```
Adding a new secret?
│
├── Is it for the frontend (Vercel)?
│   └── YES → Add to Infisical with NEXT_PUBLIC_ prefix → Auto-syncs to Vercel
│
├── Is it for a backend worker on VM?
│   └── YES → Add to Infisical → Reference in docker-compose.yml
│
└── Is it for local development only?
    └── YES → Add to Infisical → Use `infisical run` to access it
```

---

## Local Development Commands

### Run Services with Secrets

```powershell
# Build and start all services with secrets injected
infisical run --env=prod -- docker-compose up -d --build

# Start services without rebuild
infisical run --env=prod -- docker-compose up -d

# Run single command with secrets
infisical run --env=prod -- dotnet run
```

### View Secrets

```powershell
# List all secrets (masked)
infisical secrets --env=prod

# Export secrets to file (temporary use only)
infisical export --env=prod > .env.local
```

---

## Authentication

```powershell
# Login (first time)
infisical login

# Check current context
infisical whoami
```

---

## Project Configuration

The `.infisical.json` file (safe to commit) contains:

```json
{
  "workspaceId": "your-workspace-id",
  "defaultEnvironment": "prod"
}
```

---

## VM Usage (Machine Identity)

On the VM, Infisical uses Machine Identity authentication:

```bash
# Injected by start-services.sh wrapper
./scripts/start-services.sh up -d
```

The script automatically:
1. Authenticates via Machine Identity
2. Fetches secrets for `prod` environment
3. Injects into docker-compose

---

## Related

- [secrets-infisical](../../rules/secrets-infisical.md) - Secrets management law
- [cli-docker](../cli-docker/SKILL.md) - Docker commands

