# Adding a Worker to Azure Container Apps CI/CD

Guide for adding new data fetcher workers to the Azure Container Apps CI/CD pipeline.

---

## Prerequisites

- Worker has a Dockerfile at `services/data-fetchers/<WorkerName>/Dockerfile`
- Worker builds from the `services/` context (to access `common/` libraries)
- Worker exposes port 8080 for health checks

---

## Step-by-Step Process

### Step 1: Add GitHub Secrets

Add any API keys or secrets the worker needs:

1. Go to: `https://github.com/<org>/<repo>/settings/secrets/actions`
2. Click "New repository secret"
3. Add each required secret

### Step 2: Add Build Step to Workflow

In `.github/workflows/deploy-azure.yml`, add after existing build steps:

```yaml
# Build and push <WorkerName> Worker
- name: Build and push <WorkerName> Worker
  run: |
    docker build \
      -f services/data-fetchers/<WorkerName>/Dockerfile \
      -t ${{ secrets.ACR_LOGIN_SERVER }}/<workername>-worker:${{ github.sha }} \
      -t ${{ secrets.ACR_LOGIN_SERVER }}/<workername>-worker:latest \
      services/
    docker push ${{ secrets.ACR_LOGIN_SERVER }}/<workername>-worker:${{ github.sha }}
    docker push ${{ secrets.ACR_LOGIN_SERVER }}/<workername>-worker:latest
```

### Step 3: Add Deploy Step to Workflow

Add after existing deploy steps:

```yaml
# Deploy <WorkerName> Worker
- name: Deploy <WorkerName> Worker to Container Apps
  uses: azure/container-apps-deploy-action@v1
  with:
    resourceGroup: ${{ env.RESOURCE_GROUP }}
    containerAppName: ca-<workername>
    containerAppEnvironment: ${{ env.CONTAINER_ENV }}
    imageToDeploy: ${{ secrets.ACR_LOGIN_SERVER }}/<workername>-worker:${{ github.sha }}
    targetPort: 8080
    ingress: internal  # or 'external' if public access needed
    registryUrl: ${{ secrets.ACR_LOGIN_SERVER }}
    registryUsername: ${{ secrets.ACR_USERNAME }}
    registryPassword: ${{ secrets.ACR_PASSWORD }}
    environmentVariables: |
      ASPNETCORE_ENVIRONMENT=Production
      ConnectionStrings__DefaultConnection=${{ secrets.DATABASE_CONNECTION_STRING }}
      <WorkerName>__ApiKey=${{ secrets.<WORKER_API_KEY_SECRET> }}
      <WorkerName>__BaseUrl=<api-base-url>
      MetricsService__BaseUrl=https://ca-metrics.internal
      MetricsService__WorkerName=<workername>
      MetricsService__Enabled=true
```

### Step 4: Update Documentation

Update `instruction/architecture/azure-container-apps-deployment.md`:

1. Add container app to Azure Resources table
2. Add secrets to GitHub Secrets table
3. Add environment variables section
4. Update workflow steps list
5. Add Dockerfile to Related Files table

### Step 5: Commit and Push

```bash
git add .github/workflows/deploy-azure.yml instruction/architecture/azure-container-apps-deployment.md
git commit -m "feat: Add <WorkerName> worker to Azure Container Apps CI/CD pipeline"
git push origin main
```

### Step 6: Verify Deployment

```powershell
# Check GitHub Actions
# Go to: https://github.com/<org>/<repo>/actions

# After workflow completes, verify in Azure
az containerapp list --resource-group rg-stocktracker -o table
```

---

## Configuration Reference

### Ingress Types

| Type | Use Case |
|------|----------|
| `internal` | Worker only needs to communicate within Azure (recommended for data fetchers) |
| `external` | Worker needs public URL (e.g., for webhooks, external health checks) |

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `ASPNETCORE_ENVIRONMENT` | Always `Production` for Azure |
| `ConnectionStrings__DefaultConnection` | Database connection from GitHub secret |
| `MetricsService__BaseUrl` | `https://ca-metrics.internal` |
| `MetricsService__WorkerName` | Lowercase worker identifier |
| `MetricsService__Enabled` | `true` to enable metrics |

### Naming Conventions

| Resource | Pattern | Example |
|----------|---------|---------|
| Container App | `ca-<workername>` | `ca-twelvedata` |
| ACR Image | `<workername>-worker` | `twelvedata-worker` |
| GitHub Secret | `<WORKER>_API_KEY` | `TWELVE_DATA_API_KEY` |
| Env Variable | `<WorkerName>__<Setting>` | `TwelveData__ApiKey` |

---

## Troubleshooting

### Workflow Fails at Build

- Check Dockerfile path is correct
- Verify build context is `services/` (not the worker directory)
- Check common libraries are accessible

### Workflow Fails at Deploy

- Verify all GitHub secrets exist
- Check secret names match exactly (case-sensitive)
- Ensure Container Apps Environment exists

### Container App Not Starting

```powershell
# Check logs
az containerapp logs show --name ca-<workername> --resource-group rg-stocktracker --follow

# Check revision status
az containerapp revision list --name ca-<workername> --resource-group rg-stocktracker -o table
```




