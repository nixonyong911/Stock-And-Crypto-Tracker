---
name: delegate
description: Master-sub agent orchestration for parallel task execution. Use during planning mode to identify delegatable tasks, specify sub-agent commands, output paths, and check-back steps. Enables concurrent work by delegating independent tasks to CLI agents.
triggers:
  - "delegate task"
  - "parallel tasks"
  - "sub agent"
  - "background agent"
  - "planning delegation"
---

# Delegate Skill

Master-sub agent orchestration where delegation is planned during planning mode, not decided on-the-fly.

## Planning Workflow

During planning mode, follow these steps:

1. **Identify independent tasks** — Find tasks that can run in parallel without blocking each other
2. **Mark delegatable tasks** — Explicitly note which tasks to delegate in the plan
3. **Specify delegation details** — For each delegated task, include:
   - Command: `cursor-agent -p` or `claude -p`
   - Skill/instruction path to reference
   - Output path: `instruction/delegate/<task-name>/output.md`
4. **Add check-back steps** — Plan when to read results before dependent tasks
5. **Assign master work** — Identify what master agent works on while sub-agents run

## Output Structure

Delegated tasks write results to centralized storage:

```
instruction/delegate/
└── <task-name>/
    └── output.md    # Sub-agent writes results here
```

## Commands

| Command | Use When |
|---------|----------|
| `cursor-agent -p "<msg>"` | Default — most tasks |
| `claude -p "<msg>"` | Instruction folder changes only |

## Models

| Model | Use For |
|-------|---------|
| sonnet-4.5 | Simple, well-defined tasks |
| opus-4.5 | Complex tasks, reviews, instruction changes |

## When to Delegate

- Independent tasks that don't block each other (CI/CD + DB setup)
- Skill-based tasks — pass skill path in message
- Monitoring: `gh run watch`, health checks, log analysis
- CLI tasks: Docker logs, GitHub workflows, VM checks

## When NOT to Delegate

- Task blocks next step (has dependencies)
- Final task with nothing else to do (just execute directly)
- Destructive operations without review

## Execution Rules

**Critical:** After delegating a task:
1. Continue working on other tasks immediately — do not wait
2. Before any dependent step, **always read** `instruction/delegate/<task-name>/output.md`
3. Use the output to inform decisions (e.g., if validation fails, act on it)
4. Clean up delegate folders after consuming results

## Sub-Agent Instructions

Background agents have no prior context. Include:

- File paths and skill references
- Clear success criteria
- Output path: `instruction/delegate/<task-name>/output.md`

## Plan Format

```markdown
- [ ] Task A: CI/CD setup
      → Delegate: `cursor-agent -p "Follow instruction/skills/cli/References/github/REFERENCE.md to add workflow. Write results to instruction/delegate/cicd-setup/output.md"`
      → Output: instruction/delegate/cicd-setup/output.md
- [ ] Task B: Database migration  
      → Delegate: `cursor-agent -p "Apply migration per instruction/database/schema.md. Write results to instruction/delegate/db-migration/output.md"`
      → Output: instruction/delegate/db-migration/output.md
- [ ] Task C: Grafana dashboard
      → Master agent (while A & B run)
- [ ] Check A & B results (read instruction/delegate/*/output.md)
- [ ] Task D: Integration (depends on A, B, C)
```

## Examples

See [references/examples.md](references/examples.md) for detailed delegation plan examples.

