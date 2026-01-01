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
- `services/workers/data-fetcher/TwelveData/**`
- `services/workers/analysis/**`
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
| TwelveData | `services/workers/data-fetcher/TwelveData/**`, `services/common/**` |
| Analysis | `services/workers/analysis/**`, `services/common/**` |
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

## Docker Image Loading

When loading Docker images on the VM, use **explicit service names** instead of glob patterns:

```bash
# CORRECT: Explicit service names
for NAME in twelvedata metrics back-office; do
  img="/tmp/${NAME}.tar.gz"
  if [ -f "$img" ]; then
    gunzip -c "$img" | docker load
    rm "$img"
  fi
done

# WRONG: Glob pattern (may pick up unrelated files)
for img in /tmp/*.tar.gz; do  # DON'T DO THIS
  ...
done
```

**Why**: The `/tmp/` directory may contain other `.tar.gz` files (e.g., `grafanactl`, system packages) that are NOT Docker images.

---

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

1. Add trigger path to `deploy-vm.yml` (use correct worker type path):
   ```yaml
   paths:
     # For data-fetcher workers:
     - 'services/workers/data-fetcher/YourWorker/**'
     # For analysis workers:
     - 'services/workers/analysis/YourWorker/**'
   ```

2. Add change detection filter:
   ```yaml
   yourworker:
     # For data-fetcher workers:
     - 'services/workers/data-fetcher/YourWorker/**'
     # For analysis workers:
     - 'services/workers/analysis/YourWorker/**'
     - 'services/common/**'
   ```

3. Add build step with caching:
   ```yaml
   - name: Build YourWorker image
     if: needs.detect-changes.outputs.yourworker == 'true' || github.event.inputs.force_build == 'true'
     uses: docker/build-push-action@v5
     with:
       context: services/
       # For data-fetcher workers:
       file: services/workers/data-fetcher/YourWorker/Dockerfile
       # For analysis workers:
       file: services/workers/analysis/YourWorker/Dockerfile
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

7. Update `instruction/skills/cli-caddy/SKILL.md` with the new endpoint

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

---

## Docker Build Context Notes

### Context Paths: GitHub Actions vs VM

The Docker build context path differs between GitHub Actions and VM deployment:

| Environment | Context Path | Reason |
|-------------|--------------|--------|
| **GitHub Actions** | `context: services/` | Runs from repository root |
| **VM docker-compose** | `context: ./repo/services` | docker-compose.yml is in `deployment/vm/`, repo cloned to `./repo/` |

**GitHub Actions Example** (`.github/workflows/deploy-vm.yml`):
```yaml
- name: Build YourWorker image
  uses: docker/build-push-action@v5
  with:
    context: services/                           # ← Relative to repo root
    file: services/workers/data-fetcher/YourWorker/Dockerfile
```

**VM docker-compose Example** (`deployment/vm/docker-compose.yml`):
```yaml
yourworker:
  build:
    context: ./repo/services                     # ← Relative to docker-compose.yml location
    dockerfile: workers/data-fetcher/YourWorker/Dockerfile
```

### Why This Matters

1. **GitHub Actions**: The workflow file is at `.github/workflows/` and the context is relative to the repository root (where the workflow runs)
2. **VM**: The `docker-compose.yml` file is at `deployment/vm/` and the repository is cloned to `/opt/stocktracker/repo/`, so the context is `./repo/services`

**Key Takeaway**: Always use the correct context path for your environment. The Dockerfile path remains the same in both cases (relative to the context).

---

## Related Documentation

### Rules
- [Docker Conventions](./conventions/docker.md) - Multi-stage builds, security, optimization
- [Security Best Practices](./security.md) - Secret management in CI/CD
- [Infrastructure Config](../reference/infrastructure-config.md) - VM and service configuration

### Skills
- [Worker Requirements](../skills/worker-requirements/SKILL.md) - Adding workers to CI/CD pipeline
- [CLI GitHub Skill](../skills/cli-github/SKILL.md) - Working with GitHub Actions
