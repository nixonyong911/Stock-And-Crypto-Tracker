# Task Completion Agent

## Purpose

Handle cleanup after completing tasks. Scan `instruction/history/` and `instruction/todo/`, verify completion against conversation and code changes, split/move completed items to `instruction/completed/`.

---

## How to Invoke

In Cursor chat, say:
- "cleanup tasks"
- "handle completed tasks"
- "run task completion agent"
- Reference this file directly

---

## Workflow

### Step 1: Gather Context

1. **Review conversation history** - What was discussed/completed in this session?
2. **Identify changed files** - What code/config files were modified?
3. **Note any deployments** - Were services deployed, migrations run, etc.?

### Step 2: Scan Task Folders

Scan these folders for task files:
- `instruction/history/**/*.md`
- `instruction/todo/**/*.md`

### Step 3: Cross-Reference Completion

For each task file found:

1. **Read the task file** - Extract all TODO items, checkboxes, status markers
2. **Verify against evidence**:
   - Does conversation show this was done?
   - Do code changes match what the task describes?
   - Were mentioned files created/modified?
   - Were deployments/commands executed?

### Step 4: Classify Tasks

| Evidence | Classification |
|----------|----------------|
| All items verified complete | ✅ FULLY COMPLETE |
| Some items complete, some pending | 🟡 PARTIALLY COMPLETE |
| No evidence of completion | ❌ NOT COMPLETE |

### Step 5: Present Summary for Confirmation

**Always ask before making changes.** Present findings like:

```
I found the following task status based on our conversation:

📁 instruction/history/azure/2025-12-27-vm-migration.md
  - [x] Deploy TwelveData service ✅ Verified (docker ps shows running)
  - [x] Configure Caddy routes ✅ Verified (Caddyfile updated)
  - [ ] Enable Metrics service ❌ Not done

Recommended action:
1. SPLIT this file:
   - Move completed items → instruction/completed/azure/2025-12-27-vm-migration-complete.md
   - Keep pending items → instruction/history/azure/2025-12-27-vm-migration.md

📁 instruction/todo/phase-2-vm-services.md
  - No changes detected

Proceed with cleanup?
1. Yes, apply recommended changes
2. No, skip for now
3. Modify (tell me what to change)
4. **Or type your own answer**
```

### Step 6: Execute Changes

Only after user confirms:

1. **For FULLY COMPLETE files**:
   - Move entire file to `instruction/completed/<category>/`
   - Add `-complete` suffix to filename
   - Example: `2025-12-27-task.md` → `2025-12-27-task-complete.md`

2. **For PARTIALLY COMPLETE files**:
   - Create new file in `instruction/completed/<category>/` with completed items only
   - Update original file to remove completed items (keep pending only)
   - Add `-complete` suffix to completed file
   - Update any cross-references between files

3. **Report what was done**

---

## Completion Evidence Types

### Strong Evidence (High Confidence)

| Evidence Type | Example |
|---------------|---------|
| File exists/modified | "I created `Dockerfile`" or file in git diff |
| Command output shown | Docker ps shows service running |
| Deployment confirmed | Health check passed, Swagger accessible |
| Migration applied | EF migration status shows applied |
| Test passed | "Tests passed", "Verified working" |

### Weak Evidence (Ask for Clarification)

| Evidence Type | Action |
|---------------|--------|
| User said "done" without proof | Ask for verification command |
| File mentioned but not shown | Read the file to verify |
| Partial match | Ask user to confirm |

---

## File Naming Convention

### Source Folders
```
instruction/history/<category>/<date>-<task-name>.md
instruction/todo/<descriptive-name>.md
```

### Destination (Completed)
```
instruction/completed/<category>/<date>-<task-name>-complete.md
```

### Split Files (Partial Completion)
```
# Original (keeps pending items)
instruction/history/azure/2025-12-27-vm-migration.md

# New (completed items only)
instruction/completed/azure/2025-12-27-vm-migration-complete.md
```

---

## Completed File Template

When creating completed files, use this structure:

```markdown
# <Task Title> - COMPLETED

**Date Completed**: <today's date>
**Original Task**: `instruction/history/<path>` (if split from another file)

## Completed Items

- [x] Item 1 - <brief verification note>
- [x] Item 2 - <brief verification note>

## Summary

<1-2 sentence summary of what was accomplished>

## Related Documents

- [Remaining Tasks](../history/<path>) (if split)
- [Architecture Doc](../architecture/<path>) (if relevant)
```

---

## Cross-Reference Updates

When moving/splitting files, update references in:
- The source file (if split)
- Related architecture docs
- `.cursorrules` (if referenced there)
- `README.md` files (if referenced)

---

## Category Mapping

| Source Category | Completed Destination |
|-----------------|----------------------|
| `history/azure/` | `completed/azure/` |
| `history/caddy/` | `completed/caddy/` |
| `history/Infisical/` | `completed/Infisical/` |
| `history/oracle/` | `completed/oracle/` |
| `todo/` | `completed/todo/` (or appropriate category) |

Create destination category folder if it doesn't exist.

---

## Constraints

- **Never move without confirmation** - Always present summary first
- **Preserve pending items** - Never delete incomplete tasks
- **Verify before classifying** - Don't assume completion, check evidence
- **Maintain references** - Update cross-links when moving files
- **Keep original structure** - Completed files should maintain same section headers where relevant

---

## Example Session

**User**: "cleanup tasks"

**Agent**:
1. Reviews conversation - sees TwelveData was deployed, health check passed
2. Scans `instruction/history/` and `instruction/todo/`
3. Finds `history/azure/2025-12-27-vm-migration-phase2-pending.md`
4. Cross-references: Metrics service checkbox unchecked, no evidence of deployment
5. Presents: "No tasks appear fully completed based on our conversation. The VM migration phase 2 still has pending items (Metrics, AI-Hub). No changes recommended."
6. User confirms or provides additional context

---

## Quick Reference

| Step | Action |
|------|--------|
| 1 | Review conversation for completed work |
| 2 | Scan `history/` and `todo/` folders |
| 3 | Cross-reference tasks with evidence |
| 4 | Classify: FULL / PARTIAL / NONE |
| 5 | Present summary, ask confirmation |
| 6 | Execute: move/split files |
| 7 | Update cross-references |
| 8 | Report completion |
