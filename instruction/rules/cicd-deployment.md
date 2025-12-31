# CI/CD Pipeline & Deployment

## Pipeline Architecture

The pipeline builds Docker images on **GitHub Actions runners** (not on VM) for better performance:

| Resource | GitHub Actions (Free) | Azure VM (B2s) |
|----------|----------------------|----------------|
| CPU | 2-core (faster) | 2 vCPU (burstable) |
| RAM | 7 GB | 4 GB |
| Cost | 2000 min/month free | Fixed monthly |

**Strategy**: Build images on GHA → compress → transfer via SCP → load on VM.

## Pipeline Flow

```
Developer pushes to main
         │
         ▼
GitHub Actions (deploy-vm.yml)
         │
         ├── 1. Detect Changes (paths-filter)
         │      └── Determines which services need rebuilding
         │
         ├── 2. Build on GHA (parallel, with BuildKit cache)
         │      ├── Build only changed services
         │      ├── Use cached layers when available
         │      └── Export as compressed tar.gz (~50MB vs ~150MB)
         │
         ├── 3. Transfer to VM
         │      ├── SCP compressed images to VM
         │      ├── docker load images
         │      └── Fallback: Build on VM if GHA fails
         │
         ├── 4. Deploy Services
         │      ├── git pull latest config
         │      ├── start-services.sh up -d  ◄── Infisical injects secrets
         │      └── AI Hub: venv with hash-based caching
         │
         └── 5. Health Polling (smart, not fixed sleep)
                └── Poll endpoints until healthy or timeout
         │
         ▼
Azure VM runs services via Docker
(Secrets injected at runtime from Infisical Cloud)
```

## Trigger Paths

The pipeline triggers on changes to:
- `services/data-fetchers/TwelveData/**`
- `services/metrics/**`
- `services/ai/ai-hub/**`
- `services/back-office/**`
- `services/common/**`
- `deployment/vm/**`
- `.github/workflows/deploy-vm.yml`

Explicitly excluded:
- `services/frontend/**` (deployed via Vercel)

## Selective Builds

The pipeline uses `dorny/paths-filter` to detect which services changed:

| Service | Trigger Paths |
|---------|---------------|
| TwelveData | `services/data-fetchers/TwelveData/**`, `services/common/**` |
| Metrics | `services/metrics/**`, `services/common/**` |
| Back Office | `services/back-office/**` |
| AI Hub | `services/ai/ai-hub/**` |
| Config | `deployment/vm/**`, `.github/workflows/deploy-vm.yml` |

**Optimization**: If only config files change, all Docker builds are skipped entirely.

## Caching Strategy

### Docker BuildKit Cache (GHA)
```yaml
cache-from: type=gha,scope=<service>
cache-to: type=gha,mode=max,scope=<service>
```
Layers are cached in GitHub's 10GB cache. Subsequent builds only rebuild changed layers.

### AI Hub Venv Cache (VM)
The AI Hub dependencies are cached using a hash of `requirements.txt`:
- If hash matches cached version → skip pip install
- If hash differs → recreate venv and install
- Location: `/opt/stocktracker/ai-hub-venv`

## Health Checks

Smart polling replaces fixed sleep:
```bash
wait_healthy() {
  # Poll every 2s, timeout at 30s
  # Returns immediately when service responds
}

wait_healthy ".../api/twelvedata/health/live" "TwelveData"
wait_healthy ".../api/metrics/health/live" "Metrics"

# AI Hub: Internal only (not exposed via Caddy) - check via SSH
ssh azureuser@VM 'curl -sf http://localhost:8084/health/live'

# Back Office: Check public URL
curl -sf .../back-office/
```

**Impact**: Services often start in 10-20s. Saves 25-35s vs fixed 45s sleep.

## Fallback Strategy

If GitHub Actions builds fail, the pipeline automatically falls back to building on VM:

```
GHA Build ──► Success ──► Transfer images ──► Deploy
    │
    └──► Failure ──► VM Build (fallback) ──► Deploy
```

Triggers for fallback:
- GHA service degradation
- Build errors (network, cache issues)
- Quota exceeded

The workflow logs `::warning::` annotation when fallback is used.

## Transfer Metrics

Each deployment logs transfer sizes in the GitHub Actions summary:
- Individual image sizes
- Total transfer size
- Reminder that Azure inbound transfer is FREE

## Manual Trigger

Go to GitHub Actions → Deploy to Azure VM → Run workflow

Options:
- `force_build`: Rebuild all services regardless of change detection

## Adding New Workers to CI/CD

1. Add trigger path to `deploy-vm.yml`:
   ```yaml
   paths:
     - 'services/data-fetchers/YourWorker/**'
   ```

2. Add change detection filter:
   ```yaml
   yourworker:
     - 'services/data-fetchers/YourWorker/**'
     - 'services/common/**'
   ```

3. Add build step with caching:
   ```yaml
   - name: Build YourWorker image
     if: needs.detect-changes.outputs.yourworker == 'true' || github.event.inputs.force_build == 'true'
     uses: docker/build-push-action@v5
     with:
       context: services/
       file: services/data-fetchers/YourWorker/Dockerfile
       tags: yourworker:latest
       cache-from: type=gha,scope=yourworker
       cache-to: type=gha,mode=max,scope=yourworker
       outputs: type=docker,dest=/tmp/yourworker.tar
   ```

4. Add compression block in "Compress Docker images" step:
   ```bash
   if [ -f /tmp/yourworker.tar ]; then
     gzip -1 < /tmp/yourworker.tar > /tmp/images/yourworker.tar.gz
     BUILT="${BUILT}yourworker,"
     echo "✅ YourWorker compressed"
   else
     echo "⏭️ YourWorker skipped (unchanged)"
   fi
   ```

5. Add service to `deployment/vm/docker-compose.yml`

6. Add Caddy route to `deployment/vm/Caddyfile`

7. Update `instruction/cli/caddy/worker-endpoints.md` with the new endpoint

## Deployment Commands

### From Local (Manual)
```powershell
# SSH and rebuild specific service (fallback method)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose up -d --build <service>"
```

### Via CI/CD (Automatic)
Push to main branch with changes in trigger paths.

## Expected Performance

| Scenario | Time |
|----------|------|
| Config-only change | ~1-2 min (skip all builds) |
| Single service change (cached) | ~3-4 min |
| Full rebuild | ~5-7 min |
| Baseline (before optimization) | ~8-12 min |

**Improvement**: 60-70% faster than original pipeline.
