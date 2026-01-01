# Instruction Documentation

**Last Updated**: December 31, 2025

This folder contains all documentation for the Stock and Crypto Tracker project, organized for AI agent consumption.

## Quick Start

**Agent reads first**: [KNOWLEDGE.md](KNOWLEDGE.md) - Current project state and recent learnings

## Folder Structure

```
instruction/
├── KNOWLEDGE.md        # READ FIRST - Project state & recent learnings
├── skills/             # All skills (lazy-loaded, Agent Skills spec format)
│   ├── knowledge-keeper/  # Maintain project knowledge
│   ├── skill-creator/     # Create new skills
│   ├── rules-keeper/      # Maintain project rules
│   ├── data-fetcher/      # Create data-fetcher workers
│   └── cli-*/             # CLI skills by tech stack (docker, caddy, grafana, etc.)
├── rules/              # Project-wide LAWS (always applied)
│   ├── core-context.md    # Project overview & structure
│   ├── cicd-deployment.md # CI/CD pipeline law
│   ├── secrets-infisical.md # Secrets management law
│   ├── vm-operations.md   # VM operations reference
│   └── conventions/       # Coding standards
├── tasks/
│   ├── active/         # 🟡 Pending work (checkpoints)
│   └── completed/      # ✅ Done work (archived)
├── architecture/       # Service-specific architecture docs
├── reference/          # Specifications & guides
├── database/           # Schema documentation
├── ai-agent/           # AI trading analysis guides
└── archived/           # Deprecated/superseded docs
```

## Key Concepts

### KNOWLEDGE.md (Project Memory)

Living document tracking:
- Active components and their status
- Recent learnings and gotchas
- Pending patterns to document

### Skills (Lazy-Loaded)

Self-contained instructions following the [Agent Skills spec](https://agentskills.io/specification):

**Core Skills:**
- [knowledge-keeper](skills/knowledge-keeper/SKILL.md) - Maintain project knowledge
- [skill-creator](skills/skill-creator/SKILL.md) - Create new spec-compliant skills
- [rules-keeper](skills/rules-keeper/SKILL.md) - Maintain project rules when code changes
- [creating-new-worker](skills/creating-new-worker/SKILL.md) - Create new workers

**CLI Skills:**
- [cli-docker](skills/cli-docker/SKILL.md), [cli-caddy](skills/cli-caddy/SKILL.md), [cli-grafana](skills/cli-grafana/SKILL.md), etc.

### Rules (Project Laws)

Project-wide constraints that ALL agents must follow:
- [core-context.md](rules/core-context.md) - Project overview & structure
- [cicd-deployment.md](rules/cicd-deployment.md) - CI/CD pipeline
- [secrets-infisical.md](rules/secrets-infisical.md) - Secrets management
- [conventions/](rules/conventions/) - Coding standards

### Tasks (Work Tracking)

- `tasks/active/` - Current work, checkpoints
- `tasks/completed/` - Archived completed work

## Commands

| Command | Purpose |
|---------|---------|
| `/finish-task` | Move completed tasks to `tasks/completed/` |
| `/knowledge-update` | Extract learnings from conversation → update KNOWLEDGE.md |

## Service Endpoints

| Service | URL |
|---------|-----|
| n8n Dashboard | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| Back-Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office |
| Frontend | https://stock-tracker.vercel.app/ |

## Quick Links

### Rules (Project Laws)
- [Project Overview](rules/core-context.md)
- [CI/CD Pipeline](rules/cicd-deployment.md)
- [Secrets Management](rules/secrets-infisical.md)
- [VM Operations](rules/vm-operations.md)
- [Coding Conventions](rules/conventions/)

### Architecture (Service-Specific)
- [VM Deployment](architecture/vm-deployment-architecture.md)
- [TwelveData Worker](architecture/twelvedata-architecture.md)
- [AI Hub](architecture/ai-hub-architecture.md)
- [Infisical Secrets](architecture/infisical-secrets-management.md)

### Reference
- [Metrics Specification](reference/metrics-specification.md)
- [Infrastructure Config](reference/infrastructure-config.md)

### Database
- [Schema Reference](database/schema.md)

### Skills (Core)
- [knowledge-keeper](skills/knowledge-keeper/SKILL.md) - Maintain project knowledge
- [skill-creator](skills/skill-creator/SKILL.md) - Create spec-compliant skills
- [rules-keeper](skills/rules-keeper/SKILL.md) - Update rules when code changes
- [creating-new-worker](skills/creating-new-worker/SKILL.md) - Create new workers

### Skills (CLI)
- [cli-docker](skills/cli-docker/SKILL.md) - Docker/compose commands
- [cli-caddy](skills/cli-caddy/SKILL.md) - Worker endpoints & proxy
- [cli-grafana](skills/cli-grafana/SKILL.md) - Grafana dashboard management
- [cli-infisical](skills/cli-infisical/SKILL.md) - Secrets management CLI
- [cli-powershell](skills/cli-powershell/SKILL.md) - Custom shell functions
- [cli-github](skills/cli-github/SKILL.md) - GitHub Actions CLI
- [cli-vercel](skills/cli-vercel/SKILL.md) - Frontend deployment
- [cli-oracle](skills/cli-oracle/SKILL.md) - Oracle Cloud CLI
- [cli-ai](skills/cli-ai/SKILL.md) - AI coding agents

## Workflow

### After Completing Work

1. Run `/knowledge-update` to capture learnings
2. Say "Update rules" if code changes affected rules
3. Run `/finish-task` to move completed tasks
4. Or say "Update knowledge" for guided update

### Updating Documentation

When code changes affect documentation:
1. `knowledge-keeper` → updates KNOWLEDGE.md, creates skills
2. `rules-keeper` → updates rules/*.md, archives obsolete rules

### Creating New Workers

1. Say "Create new worker for [API name]"
2. Agent invokes `skills/creating-new-worker/SKILL.md`
3. Follow the step-by-step guide

### Creating New Skills

1. Say "Create skill for [task]"
2. [skill-creator](skills/skill-creator/SKILL.md) guides you through spec-compliant creation
3. New skill added to `skills/{name}/SKILL.md`
