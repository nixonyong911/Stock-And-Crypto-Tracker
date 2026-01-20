# CI/CD Pipeline Skill

Reference documentation for the Stock Tracker CI/CD pipeline deployed via GitHub Actions to Azure VM.

## When to Use

Use this skill when:
- Understanding how services are built and deployed
- Troubleshooting deployment issues
- Adding new services to the pipeline
- Managing rollbacks
- Understanding version tracking

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-vm.yml` | Main deployment workflow |
| `deployment/vm/docker-compose.yml` | Docker Compose for VM services |
| `services/back-office/src/app/infrastructure/versions/page.tsx` | Version dashboard UI |
| `services/back-office/src/app/api/versions/route.ts` | Version API endpoint |

## Services (8 Total)

| Workflow Name | DB Service Name | Docker Image | Build Location |
|---------------|-----------------|--------------|----------------|
| twelvedata | twelvedata | stocktracker-twelvedata | GHA |
| analysis | candlestick-analysis | stocktracker-candlestick-analysis | GHA |
| metrics | metrics | stocktracker-metrics | GHA |
| backoffice | back-office | stocktracker-back-office | GHA |
| mcp | mcp-analysis | stocktracker-mcp-analysis | GHA |
| telegram2 | telegram-bot-2.0 | stocktracker-telegram-bot-2.0 | GHA |
| aihub2 | ai-hub2 | stocktracker-ai-hub2 | GHA |
| frontend | frontend-staging | stocktracker-frontend-staging | VM only* |

*Frontend Staging requires Infisical STAGING secrets at build time, built on VM.

## Single Point of Determination

The `detect-changes` job is the **single source of truth** for what gets built:

```yaml
# Workflow outputs that control everything:
needs.detect-changes.outputs.twelvedata     # true/false
needs.detect-changes.outputs.analysis       # true/false
needs.detect-changes.outputs.any_service    # true if ANY changed
```

**Path filters** in `detect-changes` determine what triggers rebuilds:
- `services/workers/data-fetcher/TwelveData/**` → twelvedata
- `services/workers/analysis/**` → analysis
- `services/common/**` → triggers both workers

## Versioning System

**Format:** `vMAJOR.MINOR` (e.g., v1.5)

**Storage:** Supabase `worker_versions` table

**Flow:**
1. `detect-changes` queries Supabase for current versions
2. Calculates new version: `current_minor + 1`
3. Tags Docker images with new version
4. After health checks pass, updates Supabase

**Access:** Back-office dashboard at `/infrastructure/versions`

## Build Paths

### Primary: GitHub Actions
1. Build on GHA runner with BuildKit caching
2. Export as compressed tar (`gzip -1`)
3. Upload as artifact
4. Download and transfer to VM via SCP
5. Load image on VM

### Fallback: VM Build
Triggered when GHA build fails:
1. SSH to VM
2. Build only changed services (selective)
3. Uses `docker compose build <services>`

## Triggers

| Trigger | Behavior |
|---------|----------|
| Push to main | Build changed services |
| `force_build: true` | Build all services (ignore changes) |
| `rollback_service: <service>` | Rollback specific service |

## Rollback

Via workflow_dispatch with `rollback_service` input:

1. Decrements version in Supabase
2. Restarts container with previous version tag
3. Previous version must exist on VM (kept by cleanup)

**Requirement:** VM keeps 2 most recent versions per service

## Cleanup Strategy

| Location | Retention |
|----------|-----------|
| GHA Artifacts | 1 most recent |
| VM Images | 2 most recent per service (running + rollback) |

## Common Operations

### Force Rebuild All
```bash
gh workflow run deploy-vm.yml -f force_build=true
```

### Rollback Service
```bash
gh workflow run deploy-vm.yml -f rollback_service=twelvedata
```

### Check Version
```bash
# Via API
curl https://nxserver.malaysiawest.cloudapp.azure.com/back-office/api/versions

# Via SSH
ssh azureuser@20.17.176.1 'docker images stocktracker-twelvedata --format "{{.Tag}}"'
```

### View Build Logs
```bash
gh run view <run-id> --log
```

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `VM_SSH_PRIVATE_KEY` | SSH access to Azure VM |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase public key (back-office build) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key (version CRUD) |

## Troubleshooting

### Build Failed on GHA
- Check GHA logs: `gh run view <run-id> --log`
- Verify Dockerfile syntax
- Check BuildKit cache scope conflicts

### Version Not Updated
- Verify `SUPABASE_SERVICE_ROLE_KEY` secret is set
- Check Supabase table RLS policies
- Review "Update versions in Supabase" step logs

### Rollback Failed
- Check if previous version image exists on VM
- Verify minor_version > 0 (can't rollback v1.0)
- Check VM disk space for image storage

### Service Not Starting
- SSH to VM: `docker logs <container-name>`
- Check Infisical secrets injection
- Verify health endpoint responds
