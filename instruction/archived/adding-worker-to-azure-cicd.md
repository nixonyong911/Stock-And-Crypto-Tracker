# Adding a Worker to Azure Container Apps CI/CD (ARCHIVED)

> **DEPRECATED**: This document is archived for historical reference only.
> 
> As of December 27, 2025, all backend services have been migrated from Azure Container Apps to an Azure VM.
> The CI/CD pipeline now deploys directly to the VM via SSH.
> 
> For adding new workers, see: [VM Deployment Architecture](../../../architecture/vm-deployment-architecture.md)

---

## Historical Guide (No Longer Applicable)

Guide for adding new data fetcher workers to the Azure Container Apps CI/CD pipeline.

### Prerequisites

- Worker has a Dockerfile at `services/data-fetchers/<WorkerName>/Dockerfile`
- Worker builds from the `services/` context (to access `common/` libraries)
- Worker exposes port 8080 for health checks

### Step-by-Step Process

#### Step 1: Add GitHub Secrets

Add any API keys or secrets the worker needs:

1. Go to: `https://github.com/<org>/<repo>/settings/secrets/actions`
2. Click "New repository secret"
3. Add each required secret

#### Step 2: Add Build Step to Workflow

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

#### Step 3: Add Deploy Step to Workflow

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
    ingress: internal
    registryUrl: ${{ secrets.ACR_LOGIN_SERVER }}
    registryUsername: ${{ secrets.ACR_USERNAME }}
    registryPassword: ${{ secrets.ACR_PASSWORD }}
    environmentVariables: |
      ASPNETCORE_ENVIRONMENT=Production
      ConnectionStrings__DefaultConnection=${{ secrets.DATABASE_CONNECTION_STRING }}
      <WorkerName>__ApiKey=${{ secrets.<WORKER_API_KEY_SECRET> }}
```

### Configuration Reference

#### Naming Conventions

| Resource | Pattern | Example |
|----------|---------|---------|
| Container App | `ca-<workername>` | `ca-twelvedata` |
| ACR Image | `<workername>-worker` | `twelvedata-worker` |
| GitHub Secret | `<WORKER>_API_KEY` | `TWELVE_DATA_API_KEY` |
| Env Variable | `<WorkerName>__<Setting>` | `TwelveData__ApiKey` |

