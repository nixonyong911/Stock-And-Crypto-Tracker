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
3. Update skills and rules documentation  ← ALWAYS LAST
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

