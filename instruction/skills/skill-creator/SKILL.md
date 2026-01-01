---
name: skill-creator
description: Create and validate skills following the Agent Skills specification. Ensures all skills in instruction/skills/ are spec-compliant with proper frontmatter, structure, and documentation.
triggers:
  - "create skill"
  - "new skill"
  - "validate skill"
  - "skill for"
---

# Skill Creator

## Overview

Create and validate skills following the [Agent Skills specification](https://agentskills.io/specification). This skill ensures all skills in `instruction/skills/` are spec-compliant and well-structured.

**For detailed specification, templates, and validation rules**: See [Skill Specification Reference](../../reference/skill-specification.md)

---

## How to Invoke

- Say: "Create a skill for [task]" or "New skill: [name]"
- Say: "Validate skill [name]" to check existing skills

---

## Core Responsibilities

1. **Create Skills** - Generate valid SKILL.md with proper frontmatter + body
2. **Validate Skills** - Check against spec constraints
3. **Suggest Structure** - Recommend when to add `scripts/`, `references/`, `assets/`
4. **Update KNOWLEDGE.md** - Register new skills in Available Skills table

---

## Quick Reference: Skill Structure

```
instruction/skills/
└── skill-name/
    ├── SKILL.md          # Required
    ├── scripts/          # Optional: executable code
    ├── references/       # Optional: additional docs
    └── assets/           # Optional: static resources
```

### Frontmatter Requirements

```yaml
---
name: skill-name                    # Required: lowercase, hyphens, max 64 chars
description: What and when to use.  # Required: 1-1024 chars
triggers:                           # Optional: for discovery
  - "trigger phrase"
---
```

**See full frontmatter spec and templates**: [Skill Specification Reference](../../reference/skill-specification.md)

---

## Creation Workflow

```
User: "Create skill for [task]"
      │
      ├── 1. Determine if task is repeatable
      │      └── If not, suggest reference doc instead
      │
      ├── 2. Generate skill name (validate against spec)
      │
      ├── 3. Gather requirements
      │      ├── What does this skill do?
      │      ├── When should it be used?
      │      ├── What are the steps?
      │      └── Any prerequisites?
      │
      ├── 4. Create skill directory: instruction/skills/{name}/
      │
      ├── 5. Generate SKILL.md using template from spec
      │
      ├── 6. Add optional directories if needed
      │      ├── scripts/ - for executable helpers
      │      ├── references/ - for detailed docs
      │      └── assets/ - for templates/data
      │
      ├── 7. Validate against spec rules
      │
      └── 8. Update KNOWLEDGE.md Available Skills table
```

---

## When to Create Skills vs. Other Documentation

| Pattern | Create As |
|---------|-----------|
| Repeatable multi-step process | Skill (`skills/{name}/SKILL.md`) |
| One-time setup instructions | Task (`tasks/active/{name}.md`) |
| Reference information | Reference doc (`reference/{name}.md`) |
| Architecture decisions | Architecture doc (`architecture/{name}.md`) |
| Command cheatsheet | Skill (`skills/cli-{category}/SKILL.md`) |

**Create a skill when:**
- Same process done 2+ times
- Multiple services/files touched
- Complex integration steps
- User asks "how do I do X again?"

**Don't create a skill when:**
- One-time task
- Simple single-file change
- No clear repeatable pattern

---

## Validation Checklist

After creating a skill, ensure:

- [ ] SKILL.md exists in `instruction/skills/{name}/`
- [ ] `name` matches directory name (lowercase, hyphens)
- [ ] `name` is max 64 characters
- [ ] `description` explains what AND when (1-1024 chars)
- [ ] `triggers` field included for discovery
- [ ] Body has clear step-by-step instructions
- [ ] Body is under 500 lines (extract to reference docs if longer)
- [ ] File references are 1 level deep max
- [ ] Added to KNOWLEDGE.md Available Skills table

**For full validation rules and anti-patterns**: See [Skill Specification Reference](../../reference/skill-specification.md)

---

## Quick Start: Create a New Skill

1. **Create directory**:
   ```bash
   mkdir -p instruction/skills/{skill-name}
   ```

2. **Create SKILL.md** using [minimal template](../../reference/skill-specification.md#minimal-template)

3. **Validate** against [spec rules](../../reference/skill-specification.md#validation-rules)

4. **Register** in [KNOWLEDGE.md](../../KNOWLEDGE.md)

---

## Related

- [Skill Specification Reference](../../reference/skill-specification.md) - Full spec, templates, validation
- [Agent Skills Specification](https://agentskills.io/specification) - Official spec
- [knowledge-keeper](../knowledge-keeper/SKILL.md) - Detects patterns for new skills
- [KNOWLEDGE.md](../../KNOWLEDGE.md) - Available Skills table
