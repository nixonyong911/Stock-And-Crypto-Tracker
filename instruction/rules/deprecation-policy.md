# Deprecation & Archiving Policy

**Last Updated**: 2026-01-01

This document defines how to deprecate outdated documentation, archive old content, and maintain documentation hygiene.

---

## Guiding Principles

1. **Preserve history** - Don't delete, archive
2. **Date everything** - Track when content was created and deprecated
3. **Redirect users** - Point to replacement documentation
4. **Clean actively** - Regular hygiene prevents documentation rot

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
    └── completed/         # This is for completed tasks, not deprecated docs
```

### Archive Naming Convention

```
instruction/archived/{YEAR}/{MONTH}/{original-filename}.md
```

**Examples:**
- `instruction/archived/2025/12/prometheus-setup.md`
- `instruction/archived/2025/11/old-database-migration.md`

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

### November 2025

| File | Deprecated | Reason | Replacement |
|------|------------|--------|-------------|
| old-cicd-pipeline.md | 2025-11-15 | Optimized pipeline | [cicd-deployment.md](../rules/cicd-deployment.md) |
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

### Temporary vs Outdated

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

### Example 3: Completed Task

**Scenario**: Phase 1 VM migration complete

**Steps:**
1. Move `tasks/active/phase-1-vm-migration.md` → `tasks/completed/`
2. **Do NOT** move to `archived/` (tasks ≠ deprecated docs)
3. Add `-complete` suffix: `phase-1-vm-migration-complete.md`

---

## Git Commit Conventions

### Archiving a File

```bash
git commit -m "docs: archive prometheus-setup (deprecated 2025-12-30)"
```

### Updating References

```bash
git commit -m "docs: update references from prometheus-setup to grafana-cloud"
```

### Index Update

```bash
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

## Related Documentation

### Rules
- [Task Management Workflow](./task-management.md) - For active → completed tasks (not deprecated docs)
- [AI Behavior Guidelines](./ai-behavior.md) - AI agent standards and documentation expectations
- [Core Context](./core-context.md) - Project overview and structure

### Reference
- [KNOWLEDGE.md](../KNOWLEDGE.md) - Current system state and active components

### Skills
- [Knowledge Keeper Skill](../skills/knowledge-keeper/SKILL.md) - Extracting learnings from work
- [Rules Keeper Skill](../skills/rules-keeper/SKILL.md) - Updating rules documentation
