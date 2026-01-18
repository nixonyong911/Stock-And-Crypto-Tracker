# GitHub Workflows

GitHub CLI (`gh`) commands for managing GitHub Actions workflows and deployments.

---

## Trigger Workflows

### Deploy to Azure VM

```powershell
# Trigger VM deployment workflow manually
gh workflow run "Deploy to Azure VM"

# Or use workflow file name
gh workflow run deploy-vm.yml

# Trigger with inputs
gh workflow run deploy-vm.yml -f force_build=true
```

---

## Check Workflow Status

### List Recent Runs

```powershell
# List recent workflow runs
gh run list --workflow=deploy-vm.yml

# List with limit
gh run list --workflow=deploy-vm.yml --limit 5

# List all workflows
gh run list
```

### View Run Details

```powershell
# View specific run details
gh run view <run-id>

# View run logs
gh run view <run-id> --log

# Watch run in progress
gh run watch
```

---

## Manage Workflow Runs

### Re-run Workflows

```powershell
# Re-run failed workflow
gh run rerun <run-id>

# Re-run specific jobs
gh run rerun <run-id> --job=<job-id>
```

### Cancel Workflows

```powershell
# Cancel running workflow
gh run cancel <run-id>
```

---

## Workflow Files

| Workflow | File | Purpose |
|----------|------|---------|
| **Deploy to Azure VM** | `deploy-vm.yml` | Deploy backend services to VM |

---

## Common Tasks

### Check if Latest Deployment Succeeded

```powershell
gh run list --workflow=deploy-vm.yml --limit 5
```

### Trigger Deployment After Code Changes

```powershell
# Trigger deployment
gh workflow run "Deploy to Azure VM"

# Watch progress
gh run watch

# Check status
gh run list --workflow=deploy-vm.yml --limit 1
```

### Debug Failed Deployment

```powershell
# View logs of failed run
gh run list --workflow=deploy-vm.yml --limit 5
gh run view <failed-run-id> --log

# Re-run after fix
gh run rerun <failed-run-id>
```

---

## Workflow Inputs

### deploy-vm.yml

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `force_build` | boolean | false | Force rebuild all Docker images |

**Example**:
```powershell
gh workflow run deploy-vm.yml -f force_build=true
```

---

## CI/CD Pipeline Overview

The `deploy-vm.yml` workflow:
1. Builds Docker images locally on GitHub runner
2. Saves images to tar files
3. SSH copies tar files to VM
4. SSH loads images on VM
5. Runs `docker compose up` via SSH
6. Performs health check verification

**Secrets Required**:
- `VM_SSH_PRIVATE_KEY` - SSH key for VM access
- Synced from Infisical via GitHub Secrets integration

---

## Related

- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - VM and deployment details
- [Docker Commands](docker-commands.md) - Container management
