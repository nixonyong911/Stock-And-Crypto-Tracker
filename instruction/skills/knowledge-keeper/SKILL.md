---
name: knowledge-keeper
description: Maintain project knowledge by extracting learnings from conversations, invoking skills for repeatable tasks, managing task lifecycle, and detecting patterns that should become new skills.
triggers:
  - "update knowledge"
  - "knowledge update"
  - "extract learnings"
  - "what did we learn"
  - "finish task"
---

# Knowledge Keeper Skill

## Overview

Maintain project knowledge by:
1. **Learning** - Extracting learnings from conversations
2. **Skill Invocation** - Referencing skills for repeatable tasks
3. **Task Lifecycle** - Managing task completion via `/finish-task`
4. **Pattern Detection** - Identifying when new skills are needed

---

## How to Invoke

- Say: "Update knowledge" or run `/knowledge-update`
- Automatically suggested at end of significant work sessions

---

## Core Responsibilities

### 1. Knowledge Updates

After significant work, extract and update:

| Extraction | Destination |
|------------|-------------|
| Completed tasks | Trigger `/finish-task` |
| New coding patterns | `rules/conventions/*.md` |
| Architecture changes | `KNOWLEDGE.md` Active Components |
| New constraints/laws | Invoke [rules-keeper](../rules-keeper/SKILL.md) |
| Learnings/gotchas | `KNOWLEDGE.md` Recent Learnings |
| New repeatable process | Invoke [skill-creator](../skill-creator/SKILL.md) |

### 2. Skill Invocation

When user asks for repeatable tasks, read and follow relevant skill:

| User Says | Invoke Skill |
|-----------|--------------|
| "create new data fetcher" | `skills/creating-new-worker/SKILL.md` |
| "add new worker" | `skills/creating-new-worker/SKILL.md` |
| "onboard new API" | `skills/creating-new-worker/SKILL.md` |
| "create skill for X" | `skills/skill-creator/SKILL.md` |
| "new skill" | `skills/skill-creator/SKILL.md` |

### 3. Task Lifecycle

Use `/finish-task` command to:
- Scan `tasks/active/` for completed items
- Move completed tasks to `tasks/completed/`
- Always ask for confirmation before moving

### 4. Pattern Detection

Identify when to propose new skills:
- Same multi-step process done 2+ times
- Complex integration with multiple touchpoints
- User asks "how do I do X again?"

### 5. Skill Creation Handoff

When a new pattern is detected, hand off to [skill-creator](../skill-creator/SKILL.md):

1. Identify the repeatable pattern
2. Summarize: what it does, when to use it, steps involved
3. Invoke skill-creator: "Create skill for [pattern name]"
4. skill-creator handles spec-compliant SKILL.md creation
5. Verify skill added to KNOWLEDGE.md Available Skills table

---

## Workflow

```
User completes work
       │
       ├── 1. Scan conversation for:
       │      ├── Completed tasks
       │      ├── New patterns
       │      ├── Architecture changes
       │      └── Learnings
       │
       ├── 2. Present proposed updates
       │
       ├── 3. After confirmation:
       │      ├── Update KNOWLEDGE.md
       │      ├── Invoke rules-keeper for rule changes
       │      ├── Invoke skill-creator for new skills
       │      └── Trigger /finish-task
       │
       └── 4. Report summary
```

---

## Update Rules

### KNOWLEDGE.md

- **Active Components**: Add/update when services deployed or status changes
- **Recent Learnings**: Append with date prefix, keep last 10-15 entries
- **Pending Patterns**: Add when patterns need documentation

### rules/*.md

- **conventions/*.md**: Add when new coding pattern discovered
- **cicd-deployment.md**: Update when pipeline changes (invoke rules-keeper)
- **secrets-infisical.md**: Update when secrets flow changes (invoke rules-keeper)
- **vm-operations.md**: Update when VM config changes (invoke rules-keeper)

### skills/*/SKILL.md

- Update when process steps change
- Create new skill via [skill-creator](../skill-creator/SKILL.md) when repeatable pattern identified

---

## Constraints

- **Always ask confirmation** before updating files
- **Preserve existing content** - append, don't overwrite
- **Date prefix learnings** - Format: YYYY-MM-DD
- **Keep concise** - Summarize, don't dump raw conversation
- **One learning per line** - Easy to scan

---

## Integration with /finish-task

After knowledge update, check if tasks were completed:

```
Knowledge update complete.

I also notice these tasks may be complete:
- [x] Back-Office sidebar implementation
- [x] TwelveData batch fetch endpoint

Run /finish-task to move to tasks/completed/?
1. Yes
2. No
3. Or type your own answer
```

---

## Deprecation Note

This skill absorbs functionality from:
- ~~instruction-organizer-agent~~ (deprecated)
- ~~unfiltered/ workflow~~ (deprecated)

Direct updates replace the old two-step workflow.

---

## Related

- [KNOWLEDGE.md](../../KNOWLEDGE.md) - Project state
- [/knowledge-update](../../../.cursor/commands/knowledge-update.md) - Trigger command
- [/finish-task](../../../.cursor/commands/finish-task.md) - Task lifecycle
- [skill-creator](../skill-creator/SKILL.md) - Create new skills
- [rules-keeper](../rules-keeper/SKILL.md) - Update project rules

