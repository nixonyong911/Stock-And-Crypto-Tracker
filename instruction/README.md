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
│   ├── worker-requirements/  # Worker standard (create & review)
│   └── cli/               # Unified CLI skill with References/
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
- [worker-requirements](skills/worker-requirements/SKILL.md) - Worker standard (create & review)

**CLI Skills:**
- [cli](skills/cli/SKILL.md) - Unified CLI skill with references for docker, caddy, grafana, etc.

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
- [worker-requirements](skills/worker-requirements/SKILL.md) - Worker standard (create & review)

### Skills (CLI)
- [cli](skills/cli/SKILL.md) - Unified CLI skill
  - [docker](skills/cli/References/docker/REFERENCE.md) - Docker/compose commands
  - [caddy](skills/cli/References/caddy/REFERENCE.md) - Worker endpoints & proxy
  - [grafana](skills/cli/References/grafana/REFERENCE.md) - Grafana dashboard management
  - [infisical](skills/cli/References/infisical/REFERENCE.md) - Secrets management CLI
  - [powershell](skills/cli/References/powershell/REFERENCE.md) - Custom shell functions
  - [github](skills/cli/References/github/REFERENCE.md) - GitHub Actions CLI
  - [vercel](skills/cli/References/vercel/REFERENCE.md) - Frontend deployment
  - [oracle](skills/cli/References/oracle/REFERENCE.md) - Oracle Cloud CLI
  - [ai](skills/cli/References/ai/REFERENCE.md) - AI coding agents
  - [vm](skills/cli/References/vm/REFERENCE.md) - Azure VM operations

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

### Creating or Reviewing Workers

1. Say "Create new worker for [API name]" or "Review worker [name]"
2. Agent invokes `skills/worker-requirements/SKILL.md`
3. For new: follow step-by-step guide; For review: use compliance checklist

### Creating New Skills

1. Say "Create skill for [task]"
2. [skill-creator](skills/skill-creator/SKILL.md) guides you through spec-compliant creation
3. New skill added to `skills/{name}/SKILL.md`
