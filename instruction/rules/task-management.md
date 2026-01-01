# Task Management Workflow

**Last Updated**: 2026-01-01

---

## Folder Purpose

| Folder | Purpose | Status |
|--------|---------|--------|
| `instruction/tasks/active/` | 🟡 PENDING tasks, checkpoints to resume work | Active TODO |
| `instruction/tasks/completed/` | ✅ DONE tasks, archived for reference | Completed |

---

## Directory Organization

### Root Level vs Subdirectories

**Use ROOT level** (`tasks/active/`) for:
- General project-wide tasks
- Cross-cutting concerns (security, documentation, infrastructure)
- Multi-category tasks that don't fit a single subdirectory
- Phase planning documents (phase-1, phase-2, etc.)

**Use SUBDIRECTORIES** (`tasks/active/{category}/`) for:
- Technology-specific tasks
- Service-specific issues
- Category-focused work

### Allowed Subdirectory Categories

| Category | Purpose | Example Tasks |
|----------|---------|---------------|
| `.net/` | C# and .NET issues | Dapper bugs, EF migrations, ASP.NET Core issues |
| `AI/` | AI services and integrations | AI Hub issues, Claude CLI, model configuration |
| `azure/` | Azure infrastructure | VM setup, Container Apps, resource management |
| `caddy/` | Caddy reverse proxy | Route configuration, CaddyManager, SSL issues |
| `Infisical/` | Secrets management | Infisical CLI, sync issues, secret rotation |
| `oracle/` | Oracle Cloud Infrastructure | OCI CLI, capacity issues, resource setup |
| `grafana/` | Observability and monitoring | Dashboard creation, Alloy configuration |
| `vercel/` | Frontend deployment | Vercel deployment issues, environment variables |

**Naming Convention for Subdirectories:**
- Lowercase for single-word categories: `.net`, `azure`
- PascalCase for proper names: `Infisical`, `AI`
- Use full names, avoid abbreviations: `oracle` not `oci`

### Directory Structure Examples

```
instruction/tasks/active/
├── phase-2-vm-services.md              # Root: Multi-category task
├── nixon.md                             # Root: General task list
├── .net/
│   └── 2025-12-27-dapper-timeonly-bug.md
├── AI/
│   └── 2025-12-29-ai-hub-implementation-issues.md
├── azure/
│   └── 2025-12-30-vm-migration-phase3.md
└── oracle/
    └── 2025-12-20-oci-cli-setup-capacity-blocked.md
```

---

## Workflow Rules

1. **New complex tasks** → Create in `instruction/tasks/active/` (or subdirectory)
2. **When task is FULLY completed** → Move entire file to `instruction/tasks/completed/`
3. **When task is PARTIALLY completed**:
   - Split the file: completed parts → `instruction/tasks/completed/`
   - Keep pending parts → `instruction/tasks/active/`

---

## File Naming Convention

### Root Level Tasks

```
instruction/tasks/active/<date>-<task-name>.md
instruction/tasks/completed/<date>-<task-name>-complete.md
```

**Examples:**
- `instruction/tasks/active/2026-01-01-documentation-security-improvements.md`
- `instruction/tasks/completed/2025-12-30-twelvedata-backoffice-integration-complete.md`

### Subdirectory Tasks

```
instruction/tasks/active/{category}/<date>-<task-name>.md
instruction/tasks/completed/{category}/<date>-<task-name>-complete.md
```

**Examples:**
- `instruction/tasks/active/.net/2025-12-27-dapper-timeonly-bug.md`
- `instruction/tasks/completed/AI/2025-12-29-ai-hub-deployment-complete.md`

### Naming Guidelines

- **Date prefix**: `YYYY-MM-DD` format
- **Descriptive name**: kebab-case, concise but clear
- **Completed suffix**: Add `-complete` for archived tasks
- **Phase suffix**: Add `-phase1`, `-phase2` for multi-phase tasks

---

## When to Use Which Location

### ✅ Use Root Level When:

```markdown
# Example: instruction/tasks/active/phase-2-vm-services.md
# WHY ROOT: Touches multiple categories (Docker, Grafana, .NET, Caddy)

- [ ] Enable Metrics service (Docker + .NET)
- [ ] Configure Grafana Cloud (Grafana + Cloud)
- [ ] Update Caddyfile (Caddy)
- [ ] Implement worker metrics (.NET)
```

```markdown
# Example: instruction/tasks/active/security-audit-2026.md
# WHY ROOT: Cross-cutting security concern

- [ ] Audit .env files
- [ ] Review API authentication
- [ ] Check CORS configuration
- [ ] Update security documentation
```

### ✅ Use Subdirectory When:

```markdown
# Example: instruction/tasks/active/.net/2025-12-27-dapper-timeonly-bug.md
# WHY .NET SUBDIRECTORY: Specific to .NET/Dapper implementation

## Issue
PostgreSQL TIME columns map to TimeSpan, not TimeOnly in C#

## Fix
Update entity classes to use TimeSpan instead of TimeOnly
```

```markdown
# Example: instruction/tasks/active/AI/2025-12-29-ai-hub-implementation-issues.md
# WHY AI SUBDIRECTORY: Specific to AI Hub service

- [ ] Fix read-only filesystem error
- [ ] Remove invalid --model flag
- [ ] Update systemd configuration
```

---

## Creating New Categories

When creating a **new subdirectory category**:

1. **Check if needed**: Will you have 3+ tasks in this category?
2. **Use clear naming**: Full names, avoid abbreviations
3. **Document here**: Add to "Allowed Subdirectory Categories" table above
4. **Consistent casing**: Follow existing patterns
5. **Create in both** folders:
   ```bash
   mkdir -p instruction/tasks/active/{category}
   mkdir -p instruction/tasks/completed/{category}
   ```

**Examples of when to create new categories:**
- Adding Kubernetes → Create `k8s/` or `kubernetes/`
- Redis integration → Create `redis/`
- Payment system → Create `stripe/` or `payments/`

---

## AI Agent Task Detection

When completing work from `instruction/tasks/active/`:

1. **Detect** if any documented TODO items were completed
2. **Prompt user** for confirmation before moving files:
   ```
   I notice the following tasks from instruction/tasks/active/ appear complete:
   - [Task A] ✅ Done
   - [Task B] ✅ Done
   - [Task C] 🟡 Still pending

   Should I:
   1. Move completed tasks (A, B) to instruction/tasks/completed/
   2. Keep Task C in instruction/tasks/active/
   3. No changes needed
   4. **Or type your own answer**
   ```
3. **If user says no** → Provide supporting evidence and ask again
4. **After confirmation** → Move files and update cross-references

---

## Examples

### Example 1: Root-Level Multi-Phase Task

```markdown
# BEFORE (single file)
instruction/tasks/active/2025-12-27-vm-migration.md
  - [x] Phase 1: Core infrastructure
  - [ ] Phase 2: Metrics service
  - [ ] Phase 3: Additional services

# AFTER (split by completion)
instruction/tasks/completed/azure/2025-12-27-vm-migration-phase1-complete.md
instruction/tasks/active/phase-2-vm-services.md  # Root: touches multiple categories
```

### Example 2: Category-Specific Task

```markdown
# BEFORE (active)
instruction/tasks/active/.net/2025-12-27-dapper-timeonly-bug.md

# AFTER (completed - keeps same category)
instruction/tasks/completed/.net/2025-12-27-dapper-timeonly-bug-complete.md
```

### Example 3: Creating New Category

```bash
# New Redis integration tasks
mkdir -p instruction/tasks/active/redis
mkdir -p instruction/tasks/completed/redis

# Create task
cat > instruction/tasks/active/redis/2026-01-05-redis-caching-setup.md <<'EOF'
# Redis Caching Setup

- [ ] Install Redis on VM
- [ ] Configure Redis connection
- [ ] Implement caching layer
EOF
```

---

## Task File Template

### For Root-Level Tasks

```markdown
# <Task Title>

**Created**: YYYY-MM-DD
**Priority**: High | Medium | Low
**Status**: 🟡 Active | ✅ Complete

## Overview
Brief description of the task

## Tasks
- [ ] Task 1
- [ ] Task 2

## Notes
Any relevant notes
```

### For Category-Specific Tasks

```markdown
# <Task Title>

**Category**: <category-name>
**Created**: YYYY-MM-DD
**Status**: 🟡 Active

## Issue
Description of the issue

## Solution
- [ ] Step 1
- [ ] Step 2

## Testing
- [ ] Test 1
- [ ] Test 2
```

---

## Best Practices

1. **Keep tasks focused**: One task file = one concern
2. **Update status**: Mark items as complete promptly
3. **Add context**: Include why, not just what
4. **Link references**: Reference related docs, PRs, commits
5. **Date everything**: Use ISO date format (YYYY-MM-DD)
6. **Archive promptly**: Move completed tasks to avoid clutter
7. **Cross-reference**: Update links when moving files

---

## Related Documentation

- [KNOWLEDGE.md](../KNOWLEDGE.md) - Project knowledge state
- [AI Behavior](./ai-behavior.md) - AI agent guidelines
