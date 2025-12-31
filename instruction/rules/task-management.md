# Task Management Workflow

## Folder Purpose

| Folder | Purpose | Status |
|--------|---------|--------|
| `instruction/tasks/active/` | 🟡 PENDING tasks, checkpoints to resume work | Active TODO |
| `instruction/tasks/completed/` | ✅ DONE tasks, archived for reference | Completed |

## Workflow Rules

1. **New complex tasks** → Create in `instruction/tasks/active/`
2. **When task is FULLY completed** → Move entire file to `instruction/tasks/completed/`
3. **When task is PARTIALLY completed**:
   - Split the file: completed parts → `instruction/tasks/completed/`
   - Keep pending parts → `instruction/tasks/active/`

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

## File Naming Convention

```
instruction/tasks/active/<date>-<task-name>.md
instruction/tasks/completed/<date>-<task-name>-complete.md
```

## Example

```
# Before (mixed completed/pending)
instruction/tasks/active/2025-12-27-vm-migration.md
  - [x] Phase 1: Core infrastructure
  - [ ] Phase 2: Metrics service

# After (split)
instruction/tasks/completed/2025-12-27-vm-migration-phase1-complete.md
instruction/tasks/active/2025-12-27-vm-migration-phase2-pending.md
```

