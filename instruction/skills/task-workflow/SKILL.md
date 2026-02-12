---
name: task-workflow
description: Manage task lifecycle from active to completed. Covers folder organization, file naming, task movement workflow, and templates.
triggers:
  - "manage tasks"
  - "task workflow"
  - "move task"
  - "complete task"
  - "finish task"
---

# Task Workflow

## Overview

Manage the task lifecycle in `instruction/tasks/`. This skill covers:

- Directory organization
- File naming conventions
- Workflow for moving tasks between active and completed
- Task file templates

---

## How to Invoke

- Say: "Finish task" or "Move task to completed"
- Automatically suggested at end of work sessions by `knowledge-keeper`

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

| Category     | Purpose                      | Example Tasks                                   |
| ------------ | ---------------------------- | ----------------------------------------------- |
| `.net/`      | C# and .NET issues           | Dapper bugs, EF migrations, ASP.NET Core issues |
| `AI/`        | AI services and integrations | AI Hub issues, Claude CLI, model configuration  |
| `azure/`     | Azure infrastructure         | VM setup, Container Apps, resource management   |
| `caddy/`     | Caddy reverse proxy          | Route configuration, CaddyManager, SSL issues   |
| `Infisical/` | Secrets management           | Infisical CLI, sync issues, secret rotation     |
| `oracle/`    | Oracle Cloud Infrastructure  | OCI CLI, capacity issues, resource setup        |
| `grafana/`   | Observability and monitoring | Dashboard creation, Alloy configuration         |
| `vercel/`    | Frontend deployment          | Vercel deployment issues, environment variables |

**Naming Convention for Subdirectories:**

- Lowercase for single-word categories: `.net`, `azure`
- PascalCase for proper names: `Infisical`, `AI`
- Use full names, avoid abbreviations: `oracle` not `oci`

### Directory Structure Example

```
instruction/tasks/active/
├── phase-2-vm-services.md              # Root: Multi-category task
├── nixon.md                             # Root: General task list
├── .net/
│   └── 2025-12-27-dapper-timeonly-bug.md
├── azure/
│   └── 2025-12-30-vm-migration-phase3.md
└── oracle/
    └── 2025-12-20-oci-cli-setup-capacity-blocked.md
```

---

## File Naming Convention

### Format

```
instruction/tasks/active/<date>-<task-name>.md
instruction/tasks/completed/<date>-<task-name>-complete.md
```

### For Subdirectories

```
instruction/tasks/active/{category}/<date>-<task-name>.md
instruction/tasks/completed/{category}/<date>-<task-name>-complete.md
```

### Guidelines

- **Date prefix**: `YYYY-MM-DD` format
- **Descriptive name**: kebab-case, concise but clear
- **Completed suffix**: Add `-complete` for archived tasks
- **Phase suffix**: Add `-phase1`, `-phase2` for multi-phase tasks

---

## Workflow Rules

```
1. New complex tasks → Create in instruction/tasks/active/
        │
2. Task FULLY completed → Move entire file to tasks/completed/
        │
3. Task PARTIALLY completed:
        ├── Split: completed parts → tasks/completed/
        └── Keep: pending parts → tasks/active/
```

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

## Task File Templates

### Root-Level Task Template

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

### Category-Specific Task Template

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

## Creating New Categories

When creating a **new subdirectory category**:

1. **Check if needed**: Will you have 3+ tasks in this category?
2. **Use clear naming**: Full names, avoid abbreviations
3. **Update this skill**: Add to "Allowed Subdirectory Categories" table
4. **Consistent casing**: Follow existing patterns
5. **Create in both** folders:
   ```bash
   mkdir -p instruction/tasks/active/{category}
   mkdir -p instruction/tasks/completed/{category}
   ```

---

## Examples

### Example 1: Multi-Phase Task Split

```markdown
# BEFORE (single file)

instruction/tasks/active/2025-12-27-vm-migration.md

- [x] Phase 1: Core infrastructure
- [ ] Phase 2: Metrics service
- [ ] Phase 3: Additional services

# AFTER (split by completion)

instruction/tasks/completed/azure/2025-12-27-vm-migration-phase1-complete.md
instruction/tasks/active/phase-2-vm-services.md # Root: touches multiple categories
```

### Example 2: Category-Specific Task

```markdown
# BEFORE (active)

instruction/tasks/active/.net/2025-12-27-dapper-timeonly-bug.md

# AFTER (completed - keeps same category)

instruction/tasks/completed/.net/2025-12-27-dapper-timeonly-bug-complete.md
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

## Related

- [Task Management Rule](../../rules/task-management.md) - Brief summary
- [KNOWLEDGE.md](../../KNOWLEDGE.md) - Project knowledge state
- [knowledge-keeper](../knowledge-keeper/SKILL.md) - Invokes this workflow
