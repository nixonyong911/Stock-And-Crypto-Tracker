# Delegation Examples

## Example 1: Worker Creation

Building a new worker requires CI/CD setup and database migration — both independent tasks.

```markdown
## Plan: Create Analysis Worker

- [ ] Task 1: Database migration
      → Delegate: `cursor-agent -p "Add entity AnalysisCandlestickPattern to StockTracker.Data, generate migration per instruction/database/schema.md. Write results to instruction/delegate/db-migration/output.md"`
      → Output: instruction/delegate/db-migration/output.md

- [ ] Task 2: CI/CD workflow
      → Delegate: `cursor-agent -p "Add analysis worker to deploy-vm.yml per instruction/skills/cli/References/github/REFERENCE.md. Write results to instruction/delegate/cicd-setup/output.md"`
      → Output: instruction/delegate/cicd-setup/output.md

- [ ] Task 3: Worker implementation
      → Master agent (while 1 & 2 run)

- [ ] Check Task 1 & 2 results
      → Read instruction/delegate/db-migration/output.md
      → Read instruction/delegate/cicd-setup/output.md

- [ ] Task 4: Integration testing (depends on 1, 2, 3)
```

---

## Example 2: Multi-Service Deployment

Deploying multiple services where health checks can run in parallel.

```markdown
## Plan: Deploy All Services

- [ ] Task 1: Deploy services
      → Master agent: Run docker compose up

- [ ] Task 2: Health check - TwelveData
      → Delegate: `cursor-agent -p "Poll https://server/api/twelvedata/health/live until healthy (max 60s). Write results to instruction/delegate/health-twelvedata/output.md"`

- [ ] Task 3: Health check - Metrics
      → Delegate: `cursor-agent -p "Poll https://server/api/metrics/health/live until healthy (max 60s). Write results to instruction/delegate/health-metrics/output.md"`

- [ ] Task 4: Health check - Analysis
      → Delegate: `cursor-agent -p "Poll https://server/api/analysis/health/live until healthy (max 60s). Write results to instruction/delegate/health-analysis/output.md"`

- [ ] Task 5: Verify all healthy
      → Read all instruction/delegate/health-*/output.md
      → If any failed, investigate logs
```

---

## Example 3: Documentation Updates

Multiple documentation files can be updated in parallel.

```markdown
## Plan: Post-Feature Documentation

- [ ] Task 1: Update KNOWLEDGE.md
      → Delegate: `cursor-agent -p "Add 'Analysis Worker' to Active Components table in instruction/KNOWLEDGE.md. Write results to instruction/delegate/doc-knowledge/output.md"`

- [ ] Task 2: Update schema.md
      → Delegate: `cursor-agent -p "Add analysis_candlestick_pattern table to instruction/database/schema.md. Write results to instruction/delegate/doc-schema/output.md"`

- [ ] Task 3: Create worker README
      → Master agent (needs full context)

- [ ] Check Task 1 & 2 results
      → Read instruction/delegate/doc-*/output.md
      → Verify updates are accurate
```

---

## Key Patterns

| Pattern | When to Use |
|---------|-------------|
| Parallel setup tasks | CI/CD + DB + Config changes |
| Parallel health checks | Multi-service deployment verification |
| Parallel doc updates | Multiple independent documentation files |
| Delegated monitoring | `gh run watch` while continuing work |

