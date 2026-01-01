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
- Never commit code without reviewing it first
- Always run tests when available before committing
- Update documentation when code changes affect existing guides

---

## Code Review Checklist

Before committing code changes, the AI agent must verify:

### Security Review

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] Input validation present (SQL injection, XSS prevention)
- [ ] Parameterized queries used (Dapper `@param` syntax)
- [ ] Authentication/authorization checks in place
- [ ] Secrets loaded from Infisical/environment variables
- [ ] No credentials in logs or error messages
- [ ] CORS configured correctly (not `*` in production)

**See**: [Security Best Practices](./security.md)

### Code Quality Review

- [ ] Follows language conventions ([C#](./conventions/csharp.md), [TypeScript](./conventions/typescript.md))
- [ ] Error handling implemented (try-catch, error boundaries)
- [ ] Async/await used correctly (no blocking calls)
- [ ] Proper logging with structured context (Serilog, console.log)
- [ ] No code duplication (DRY principle)
- [ ] Variable/function names are descriptive
- [ ] Comments explain "why", not "what"

### Architecture Review

- [ ] Dependency injection used for services (.NET)
- [ ] Services properly scoped (Singleton, Scoped, Transient)
- [ ] Environment-specific config via env vars
- [ ] Health checks implemented (`/health/live`, `/health/ready`)
- [ ] PATH_BASE respected for sub-path deployment
- [ ] Database migrations handled (if schema changes)

### Docker Review (if Dockerfile changed)

- [ ] Multi-stage build used
- [ ] Non-root user configured
- [ ] .dockerignore includes unnecessary files
- [ ] Health check defined
- [ ] Minimal base image (alpine, distroless)
- [ ] Build context is `./repo/services` (VM) or `services/` (GHA)

**See**: [Docker Conventions](./conventions/docker.md)

---

## Testing Expectations

### Pre-Commit Testing

Before committing code, the AI agent should:

1. **Check if tests exist**:
   ```bash
   # .NET projects
   ls -la **/*.Tests.csproj

   # Node.js projects
   grep -l "\"test\":" package.json
   ```

2. **Run tests if available**:
   ```bash
   # .NET
   dotnet test services/YourService/tests/

   # Node.js
   npm test
   ```

3. **If tests fail**:
   - Fix the failing tests OR fix the code
   - Never commit broken tests
   - If intentionally breaking test, explain why in commit message

4. **If no tests exist**:
   - Note in commit message that testing is manual
   - Suggest adding tests for new features (but don't block)

### When to Write Tests

The AI should write tests when:

- **User explicitly requests** - "Add tests for this function"
- **Critical path code** - Authentication, payment, data integrity
- **Bug fixes** - Write failing test first, then fix
- **Complex logic** - Business rules, calculations, validation

The AI should NOT write tests when:

- **User hasn't requested** - Don't proactively add tests
- **Simple CRUD operations** - Basic create/read/update/delete
- **Configuration changes** - Docker, CI/CD, environment vars
- **Documentation updates** - Markdown files

### Test Quality Standards

If writing tests, ensure:

- [ ] Tests are isolated (no shared state)
- [ ] Tests use meaningful names (describe the behavior)
- [ ] Arrange-Act-Assert pattern followed
- [ ] Mocks used for external dependencies (DB, APIs)
- [ ] Tests run quickly (< 100ms per unit test)
- [ ] Integration tests marked/skipped if no DB available

**Example: Good Test Names**
```csharp
[Fact]
public async Task FetchStock_WithValidSymbol_ReturnsStockData()

[Fact]
public async Task FetchStock_WithInvalidSymbol_ThrowsNotFoundException()
```

---

## Documentation Standards

### When to Update Documentation

Update documentation when:

| Change Type | Affected Docs |
|-------------|---------------|
| New API endpoint | `skills/cli-caddy/SKILL.md`, Swagger docs |
| New service/worker | `data-fetcher-patterns.md`, `infrastructure-config.md` |
| CI/CD pipeline change | `cicd-deployment.md` |
| New convention/pattern | `conventions/` folder |
| Infrastructure change | `infrastructure-config.md`, `vm-operations.md` |
| New skill created | `KNOWLEDGE.md` (Available Skills table) |
| Secrets added | `security.md`, Infisical references |
| Database schema change | Architecture docs, migration notes |

### Documentation Completeness Checklist

When creating/updating docs:

- [ ] **Date stamp**: Add "Last Updated: YYYY-MM-DD"
- [ ] **Examples**: Include code examples for complex topics
- [ ] **Cross-references**: Link to related documentation
- [ ] **Table of contents**: For docs > 100 lines
- [ ] **Verification steps**: How to test/verify the content
- [ ] **Prerequisites**: What user needs before starting
- [ ] **Clear headings**: Use hierarchical structure (H1 → H2 → H3)

### Documentation Anti-Patterns

**DON'T:**
- Create README files proactively (only when requested)
- Add documentation for obvious code
- Duplicate information across multiple files
- Use vague language ("might", "probably", "usually")
- Leave broken cross-references

**DO:**
- Extract common patterns to reference docs
- Use specific language ("must", "will", "always")
- Keep single source of truth
- Update cross-references when moving files
- Add deprecation headers when replacing docs

**See**: [Deprecation Policy](./deprecation-policy.md)

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

