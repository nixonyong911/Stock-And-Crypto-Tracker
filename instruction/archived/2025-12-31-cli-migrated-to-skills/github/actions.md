# GitHub Actions CLI

## Trigger Workflows

```powershell
# Trigger deployment workflow manually
gh workflow run "Deploy to Azure Container Apps"
```

## Check Status

```powershell
# List recent workflow runs
gh run list --workflow=deploy-azure.yml

# View specific run details
gh run view <run-id>

# Watch run in progress
gh run watch
```











