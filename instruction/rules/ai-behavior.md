# AI Agent Behavior Rules

## Multiple Choice Questions

When asking the user questions with multiple choice options:
- **Always include a custom input option** (e.g., "Or type your own answer")
- Never assume pre-filled choices cover all possibilities

### Format Example

```
Which option would you like?
1. Option A
2. Option B
3. Option C
4. **Or type your own answer**
```

## General Guidelines

- Be specific and actionable in responses
- Reference existing documentation when available
- Use the Supabase MCP for database queries
- Follow coding conventions defined in `instruction/rules/conventions/`

---

## Plan Generation Rules

When generating a new plan (using `create_plan` tool):

1. **Always include as the LAST todo item**: "Update skills and rules documentation"
   - This ensures documentation stays synchronized with code changes
   - The update should invoke `rules-keeper` for rule changes
   - The update should invoke `knowledge-keeper` for skill/knowledge changes

2. **Check for affected documentation**:
   - If plan changes CI/CD → note `cicd-deployment.md` may need update
   - If plan changes infrastructure → note `vm-operations.md` may need update
   - If plan adds new patterns → note potential new skill or rule

### Example Plan Todo Structure

```
1. [Actual work items...]
2. [More work items...]
3. Update skills and rules documentation
4. Git commit and verify success  ← ALWAYS LAST
```

---

## End of Session Workflow

At the end of significant work sessions:

1. Suggest running `knowledge-keeper` to extract learnings
2. Suggest running `rules-keeper` if code changes impact rules
3. Check for completed tasks in `tasks/active/`

```
I notice we made changes that may affect documentation:
- [x] Updated deploy-vm.yml → cicd-deployment.md may need update
- [x] Added new convention → rules/conventions/ may need update

Should I invoke rules-keeper to update affected rules?
1. Yes
2. No
3. Or type your own answer
```

---

## Git Commit Verification

After completing skills/rules updates, verify changes are committed:

### Workflow

```
Skills/Rules update complete
       │
       ├── 1. Commit changes to git
       │      └── git add . && git commit -m "<message>"
       │
       ├── 2. Verify commit success
       │      ├── SUCCESS → Done ✅
       │      └── FAILURE → Go to step 3
       │
       ├── 3. Diagnose and fix the issue
       │      ├── Check error message
       │      ├── Fix the problem (lint errors, conflicts, etc.)
       │      └── Return to step 1
       │
       └── 4. If fixes were made (step 3 triggered):
              └── Re-check if skills/rules need updating
                  (fixes may have introduced new patterns or conventions)
```

### Commit Message Format

```
docs: update skills and rules documentation

- Updated [specific files]
- [Reason for update]
```

### Error Handling

| Error Type | Action |
|------------|--------|
| Lint errors | Fix linting issues, re-commit |
| Merge conflicts | Resolve conflicts, re-commit |
| Pre-commit hook failure | Address hook requirements, re-commit |
| No changes to commit | Skip commit (already up to date) |

### Re-check Documentation

If fixes were required (step 3 was triggered), always ask:

```
I had to fix issues before the commit succeeded:
- [List of fixes made]

These fixes may require documentation updates.
Should I re-check if skills/rules need updating?
1. Yes, re-check documentation
2. No, the fixes were minor
3. Or type your own answer
```

