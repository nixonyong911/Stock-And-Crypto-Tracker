# Agent Skills Specification Reference

**Last Updated**: 2026-01-01

This document provides the detailed specification for creating skills following the [Agent Skills specification](https://agentskills.io/specification).

---

## SKILL.md File Structure

```
instruction/skills/
└── skill-name/
    ├── SKILL.md          # Required
    ├── scripts/          # Optional: executable code
    ├── references/       # Optional: additional docs
    └── assets/           # Optional: static resources
```

---

## Frontmatter Specification

### Required Fields

```yaml
---
name: skill-name
description: A description of what this skill does and when to use it.
---
```

### Optional Fields

```yaml
---
name: skill-name
description: What this skill does and when to use it.
license: Apache-2.0
compatibility: Requires docker, git access
metadata:
  author: stock-tracker
  version: "1.0"
allowed-tools: Bash(git:*) Read
---
```

### Project Extension: Triggers

This project uses a `triggers` field for skill discovery:

```yaml
---
name: data-fetcher
description: ...
triggers:
  - "create new data fetcher"
  - "add new worker"
---
```

---

## Validation Rules

### Name Field (`name`)

| Rule | Valid | Invalid |
|------|-------|---------|
| Max 64 characters | `pdf-processing` | `this-name-is-way-too-long-...` |
| Lowercase only | `data-fetcher` | `Data-Fetcher` |
| Letters, numbers, hyphens | `api-v2` | `api_v2` |
| No consecutive hyphens | `my-skill` | `my--skill` |
| No leading/trailing hyphen | `skill-name` | `-skill-name-` |
| Must match directory name | `skills/data-fetcher/` → `name: data-fetcher` | Mismatch |

### Description Field (`description`)

| Rule | Example |
|------|---------|
| 1-1024 characters | Required |
| Describe WHAT it does | "Extracts text from PDF files" |
| Describe WHEN to use | "Use when working with PDF documents" |

**Good example:**
```yaml
description: Complete guide for creating a new data-fetcher worker that integrates with the Stock Tracker system, including API endpoints, database registration, metrics, and deployment.
```

**Bad example:**
```yaml
description: Helps with data fetching.
```

### Body Content Limits

| Rule | Limit |
|------|-------|
| Max lines | 500 |
| Max tokens | ~5000 |
| File reference depth | 1 level |

---

## SKILL.md Templates

### Minimal Template

```yaml
---
name: skill-name
description: Brief description of what this skill does and when to use it.
triggers:
  - "trigger phrase 1"
  - "trigger phrase 2"
---

# Skill Title

## Overview

Brief explanation of the skill's purpose.

## Steps

1. First step
2. Second step
3. Third step

## Verification

- [ ] How to verify the skill worked
```

### Full Template

```yaml
---
name: skill-name
description: Complete description (max 1024 chars) explaining what this skill does and when to use it. Include keywords that help identify relevant tasks.
license: Apache-2.0
compatibility: Requires access to Supabase, Azure VM, and Infisical
metadata:
  author: stock-tracker
  version: "1.0"
triggers:
  - "primary trigger"
  - "alternative trigger"
---

# Skill Title

## Overview

Detailed explanation of the skill's purpose and scope.

## Prerequisites

Before starting, ensure:
- [ ] Requirement 1
- [ ] Requirement 2

---

## Step 1: First Major Step

### 1.1 Sub-step

Details and code examples.

### 1.2 Sub-step

More details.

---

## Step 2: Second Major Step

Content...

---

## Verification

### Pre-Deployment
- [ ] Check 1
- [ ] Check 2

### Post-Deployment
- [ ] Verify 1
- [ ] Verify 2

---

## Related

- [Link to related doc](../../path/to/doc.md)
```

---

## Recommended Body Sections

Markdown instructions after frontmatter. Recommended sections:
- **Overview**: Brief explanation of purpose and scope
- **Prerequisites**: Requirements before starting
- **Step-by-step instructions**: Numbered steps with code examples
- **Examples**: Real-world usage examples
- **Verification/testing**: How to confirm success
- **Related links**: References to related documentation

---

## When to Create Skills vs. Other Documentation

| Pattern | Create As |
|---------|-----------|
| Repeatable multi-step process | Skill (`skills/{name}/SKILL.md`) |
| One-time setup instructions | Task (`tasks/active/{name}.md`) |
| Reference information | Reference doc (`reference/{name}.md`) |
| Architecture decisions | Architecture doc (`architecture/{name}.md`) |
| Command cheatsheet | CLI doc (`cli/{category}/{name}.md`) |

### Create a skill when:
- Same process done 2+ times
- Multiple services/files touched
- Complex integration steps
- User asks "how do I do X again?"

### Don't create a skill when:
- One-time task
- Simple single-file change
- No clear repeatable pattern

---

## Anti-Patterns

### DON'T: Overly Generic Names

```yaml
# Bad
name: worker
name: setup
name: deploy

# Good
name: data-fetcher
name: vm-service-setup
name: grafana-dashboard
```

### DON'T: Vague Descriptions

```yaml
# Bad
description: Helps with workers.

# Good
description: Complete guide for creating a new data-fetcher worker that integrates with the Stock Tracker system, including API endpoints, database registration, and deployment.
```

### DON'T: Deeply Nested References

```markdown
<!-- Bad: 3 levels deep -->
See [guide](references/subfolder/another/guide.md)

<!-- Good: 1 level deep -->
See [guide](references/guide.md)
```

### DON'T: Monolithic Skills

```markdown
<!-- Bad: 1000+ lines covering everything -->

<!-- Good: Split into focused skills -->
skills/data-fetcher/     → Creating workers
skills/grafana-panel/    → Dashboard setup
skills/vm-deploy/        → Deployment steps
```

---

## Post-Creation Checklist

After creating a skill:

- [ ] SKILL.md exists in `instruction/skills/{name}/`
- [ ] `name` matches directory name
- [ ] `description` explains what AND when
- [ ] `triggers` field included for discovery
- [ ] Body has clear step-by-step instructions
- [ ] Body is under 500 lines
- [ ] File references are 1 level deep max
- [ ] Added to KNOWLEDGE.md Available Skills table

---

## Related

- [Agent Skills Specification](https://agentskills.io/specification)
- [Skill Creator Skill](../skills/skill-creator/SKILL.md)
- [KNOWLEDGE.md](../KNOWLEDGE.md)
