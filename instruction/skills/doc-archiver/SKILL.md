---
name: doc-archiver
description: Deprecate and archive outdated documentation. Covers deprecation headers, archiving workflow, cross-reference updates, and maintenance.
triggers:
  - "deprecate doc"
  - "archive docs"
  - "deprecation workflow"
  - "outdated doc"
---

# Doc Archiver

## Overview

Deprecate and archive outdated documentation while maintaining project hygiene. This skill covers:
- When to deprecate content
- Deprecation header templates
- Archiving workflow and checklist
- Cross-reference updates
- Regular maintenance

---

## How to Invoke

- Say: "Archive this doc" or "Deprecate outdated content"
- Automatically suggested when AI detects outdated content

---

## When to Deprecate

### Deprecate When:

- **Technology replaced** - Old tool/service no longer used
  - Example: Migrated from Prometheus to Grafana Cloud

- **Process changed** - Workflow fundamentally different
  - Example: Manual VM setup → automated CI/CD

- **Architecture evolved** - System design significantly changed
  - Example: Monolith → microservices

- **Information outdated** - Content no longer accurate or relevant
  - Example: Old API endpoints, removed features

### Keep Current When:

- **Still in use** - Technology/process actively used
- **Historical reference** - Useful for understanding past decisions
- **Learning resource** - Helps onboard new team members

---

## Deprecation Workflow

```
1. Identify outdated content
         │
         ├── Check if replacement exists
         │   ├── Yes → Add deprecation notice
         │   └── No  → Create replacement first
         │
2. Add deprecation header to file
         │
3. Move file to archived/ folder
         │
4. Update cross-references
         │
5. Add entry to deprecation log
```

---

## Deprecation Header Template

Add this header to the top of deprecated files (after frontmatter if present):

```markdown
---
⚠️ **DEPRECATED** - This document is no longer maintained
- **Deprecated Date**: YYYY-MM-DD
- **Reason**: [Brief reason]
- **Replacement**: See [new-doc.md](../path/to/new-doc.md)
---
```

**Example:**
```markdown
---
⚠️ **DEPRECATED** - This document is no longer maintained
- **Deprecated Date**: 2025-12-30
- **Reason**: Migrated from Prometheus to Grafana Cloud
- **Replacement**: See [metrics-grafana-cloud.md](../reference/metrics-grafana-cloud.md)
---

# Old Prometheus Setup

[Original content remains below for historical reference]
```

---

## Archive Directory Structure

```
instruction/
├── archived/
│   ├── 2025/
│   │   ├── 12/
│   │   │   ├── prometheus-setup.md
│   │   │   └── manual-vm-deployment.md
│   │   └── 11/
│   │       └── old-cicd-pipeline.md
│   └── README.md          # Index of archived content
├── rules/
├── skills/
├── reference/
└── tasks/
    ├── active/
    └── completed/         # For completed tasks, NOT deprecated docs
```

### Archive Naming Convention

```
instruction/archived/{YEAR}/{MONTH}/{original-filename}.md
```

---

## Archiving Checklist

Before archiving a file:

- [ ] Add deprecation header with date, reason, and replacement link
- [ ] Create replacement document (if doesn't exist)
- [ ] Move file to `instruction/archived/{YEAR}/{MONTH}/`
- [ ] Update all cross-references to point to replacement
- [ ] Add entry to `instruction/archived/README.md`
- [ ] Commit with message: `docs: archive {filename} (deprecated YYYY-MM-DD)`

---

## Archive Index Template

The `instruction/archived/README.md` file should list all archived content:

```markdown
# Archived Documentation

This directory contains deprecated documentation for historical reference.

## 2025

### December 2025

| File | Deprecated | Reason | Replacement |
|------|------------|--------|-------------|
| prometheus-setup.md | 2025-12-30 | Migrated to Grafana Cloud | [metrics-grafana-cloud.md](../reference/metrics-grafana-cloud.md) |
| manual-vm-deployment.md | 2025-12-28 | Automated via CI/CD | [cicd-deployment.md](../rules/cicd-deployment.md) |
```

---

## Updating Cross-References

When archiving a file, update all references:

### Search for References

```bash
# Find all files linking to the deprecated doc
grep -r "deprecated-file.md" instruction/
```

### Update Strategy

1. **If replacement exists**: Update link to point to replacement
   ```markdown
   # Before
   See [old guide](../old-guide.md)

   # After
   See [new guide](../new-guide.md)
   ```

2. **If no direct replacement**: Add note
   ```markdown
   # Before
   See [old guide](../old-guide.md)

   # After
   ~~[Old guide](../../archived/2025/12/old-guide.md) (deprecated)~~
   ```

3. **In code comments**: Update or remove
   ```csharp
   // OLD: See instruction/old-guide.md
   // NEW: See instruction/rules/new-guide.md
   ```

---

## Special Cases

### Tasks vs Docs

| Type | Location | Action |
|------|----------|--------|
| **Temporary tasks** | `tasks/active/` | Move to `tasks/completed/` when done |
| **Outdated docs** | Any `instruction/` subfolder | Move to `archived/{YEAR}/{MONTH}/` |

**Distinction:**
- **Tasks**: Work items with completion status (active → completed)
- **Docs**: Reference material that becomes outdated (current → archived)

### What NOT to Archive

Don't archive:
- **Completed tasks** → Use `tasks/completed/` instead
- **Still-accurate historical docs** → Keep in place with date stamp
- **Architecture decisions** → These are historical by nature, keep in `architecture/`

---

## Regular Maintenance

### Quarterly Review (Every 3 Months)

- [ ] Review `instruction/` for outdated content
- [ ] Check if deprecated docs need archiving
- [ ] Update `archived/README.md` index
- [ ] Clean up broken cross-references

### Annual Cleanup (Yearly)

- [ ] Review entire `archived/` directory
- [ ] Consider purging very old content (5+ years)
- [ ] Update deprecation policy based on learnings

---

## Examples

### Example 1: Technology Migration

**Scenario**: Migrated from Prometheus to Grafana Cloud

**Steps:**
1. Add deprecation header to `monitoring/prometheus.yml`
2. Move to `instruction/archived/2025/12/prometheus.yml`
3. Update references to point to `reference/grafana-cloud-metrics.md`
4. Add entry to `archived/README.md`

### Example 2: Process Change

**Scenario**: Manual VM deployment replaced by CI/CD

**Steps:**
1. Add deprecation header to `runbooks/manual-vm-deployment.md`
2. Move to `instruction/archived/2025/12/manual-vm-deployment.md`
3. Update references to point to `rules/cicd-deployment.md`
4. Keep in archive for emergency fallback reference

---

## Git Commit Conventions

```bash
# Archiving a file
git commit -m "docs: archive prometheus-setup (deprecated 2025-12-30)"

# Updating references
git commit -m "docs: update references from prometheus-setup to grafana-cloud"

# Index update
git commit -m "docs: update archived index for December 2025"
```

---

## AI Agent Guidelines

When the AI detects outdated content during work:

1. **Inform the user**: "I noticed [file] appears outdated because [reason]"
2. **Ask for confirmation**: "Should I archive this and update references?"
3. **Suggest replacement**: "I can create/link to [new-doc] as a replacement"
4. **Execute if approved**: Follow archiving checklist
5. **Update systematically**: Find and update all cross-references

**Proactive Deprecation**: If AI creates a replacement doc that supersedes an old one, suggest archiving the old doc.

---

## Related

- [Deprecation Policy Rule](../../rules/deprecation-policy.md) - Guiding principles
- [task-workflow](../task-workflow/SKILL.md) - For task completion (not doc archiving)
- [knowledge-keeper](../knowledge-keeper/SKILL.md) - Extracting learnings
- [rules-keeper](../rules-keeper/SKILL.md) - Updating rules

