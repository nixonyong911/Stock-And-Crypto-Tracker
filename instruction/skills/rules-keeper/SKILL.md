---
name: rules-keeper
description: Automatically maintain instruction/rules/ when architecture, CI/CD, secrets, or infrastructure changes. Detects code changes that impact rules, proposes updates, and archives obsolete content. Invoke at end of work sessions alongside knowledge-keeper.
triggers:
  - "update rules"
  - "rules update"
  - "architecture changed"
  - "cicd changed"
  - "pipeline changed"
  - "secrets changed"
  - "new convention"
---

# Rules Keeper Skill

## Overview

Maintain project-wide RULES (laws that apply to ALL agents) by:
1. **Detecting** code changes that impact rules
2. **Proposing** updates to affected rule files
3. **Archiving** obsolete rules with date prefix
4. **Handing off** to `skill-creator` if pattern is a skill, not a rule

---

## How to Invoke

- Say: "Update rules" or at end of significant work sessions
- Automatically suggested by `knowledge-keeper` when rule-worthy patterns detected

---

## Rule vs Skill Decision

| Pattern Type | Classification | Action |
|--------------|----------------|--------|
| Project-wide constraint (always applies) | **RULE** | Update `rules/*.md` |
| Coding convention for a language | **RULE** | Update `rules/conventions/{lang}.md` |
| CI/CD pipeline change | **RULE** | Update `rules/cicd-deployment.md` |
| Secrets/infrastructure change | **RULE** | Update `rules/secrets-infisical.md` |
| Repeatable multi-step procedure | **SKILL** | Hand off to `skill-creator` |
| Obsolete practice | **ARCHIVE** | Move to `archived/` with date prefix |

---

## Change Detection Mapping

When these code areas change, check corresponding rules:

| Code Area Changed | Affected Rule File |
|-------------------|-------------------|
| `deployment/vm/` | `vm-operations.md`, `cicd-deployment.md` |
| `.github/workflows/` | `cicd-deployment.md` |
| `services/common/` | `conventions/csharp.md` |
| `services/*/Dockerfile` | `conventions/docker.md` |
| `services/frontend/`, `services/back-office/` | `conventions/typescript.md` |
| Infisical config changes | `secrets-infisical.md` |
| Database migrations | Notify to update `database/schema.md` |
| New service added | `core-context.md` (project structure) |

---

## Workflow

```
End of work session (or explicit "update rules")
       │
       ├── 1. Scan conversation for:
       │      ├── Code files changed
       │      ├── Architecture decisions made
       │      ├── New conventions established
       │      └── Deprecated practices identified
       │
       ├── 2. Match changes to affected rules
       │      └── Use Change Detection Mapping table
       │
       ├── 3. Propose updates to user:
       │      "I notice these rule files may need updating:
       │       - cicd-deployment.md (pipeline changed)
       │       - conventions/docker.md (Dockerfile updated)
       │       
       │       Should I update them?
       │       1. Yes, update all
       │       2. Let me review each one
       │       3. No changes needed
       │       4. Or type your own answer"
       │
       ├── 4. After confirmation:
       │      ├── Update affected rule files
       │      ├── Archive obsolete content (if any)
       │      └── Update KNOWLEDGE.md Recent Learnings
       │
       └── 5. Report summary
```

---

## Update Guidelines

### When Updating Rules

1. **Preserve structure** - Match existing format and style
2. **Be concise** - Rules should be scannable, not verbose
3. **Date changes** - Add to KNOWLEDGE.md Recent Learnings
4. **Ask confirmation** - Always before modifying rule files

### When Archiving Rules

1. Move to `instruction/archived/` with date prefix
2. Add deprecation header:
   ```markdown
   > **DEPRECATED** (2025-12-31): This rule is retired.
   > Reason: [explanation]
   > Replacement: [link to new rule if applicable]
   ```
3. Update `archived/README.md` if exists

---

## Core Rule Files

These are the project LAWS that this skill maintains:

| File | Purpose | Update When |
|------|---------|-------------|
| `core-context.md` | Project overview & structure | New services, major architecture changes |
| `cicd-deployment.md` | CI/CD pipeline | Workflow changes, new build steps |
| `secrets-infisical.md` | Secrets management | New secrets, auth flow changes |
| `vm-operations.md` | VM commands & URLs | IP changes, new endpoints |
| `task-management.md` | Task workflow | Workflow process changes |
| `ai-behavior.md` | AI agent behavior | New behavioral rules |
| `conventions/csharp.md` | C# patterns | New .NET patterns |
| `conventions/docker.md` | Docker patterns | Dockerfile changes |
| `conventions/typescript.md` | TS patterns | Frontend pattern changes |

---

## Integration with knowledge-keeper

`knowledge-keeper` detects patterns and hands off to appropriate skill:

```
knowledge-keeper detects pattern
       │
       ├── Is it a constraint/guideline? → Invoke rules-keeper
       │
       └── Is it a repeatable process? → Invoke skill-creator
```

---

## Constraints

- **Always ask confirmation** before modifying rules
- **Rules are LAWS** - they apply project-wide to all agents
- **Keep rules concise** - under 100 lines when possible
- **One rule per file** - don't mix unrelated concerns
- **Archive, don't delete** - preserve history

---

## Related

- [knowledge-keeper](../knowledge-keeper/SKILL.md) - Invokes this skill for rule patterns
- [skill-creator](../skill-creator/SKILL.md) - Create skills (not rules)
- [KNOWLEDGE.md](../../KNOWLEDGE.md) - Project state and learnings
- [archived/README.md](../../archived/README.md) - Deprecation tracking





