# GitHub CLI Skill

## Overview

GitHub CLI (`gh`) commands for managing GitHub Actions workflows and deployments.

---

## Trigger Workflows

```powershell
# Trigger VM deployment workflow manually
gh workflow run "Deploy to Azure VM"

# Trigger with inputs
gh workflow run deploy-vm.yml -f force_build=true
```

---

## Check Workflow Status

```powershell
# List recent workflow runs
gh run list --workflow=deploy-vm.yml

# View specific run details
gh run view <run-id>

# Watch run in progress
gh run watch

# View run logs
gh run view <run-id> --log
```

---

## Workflow Files

| Workflow | Purpose |
|----------|---------|
| `deploy-vm.yml` | Deploy to Azure VM |

---

## Common Tasks

### Check if deployment succeeded

```powershell
gh run list --workflow=deploy-vm.yml --limit 5
```

### Re-run failed workflow

```powershell
gh run rerun <run-id>
```

### Cancel running workflow

```powershell
gh run cancel <run-id>
```

---

## Related

- [cicd-deployment](../../../rules/cicd-deployment.md) - CI/CD pipeline law
- [vm-operations](../../../rules/vm-operations.md) - VM operations

