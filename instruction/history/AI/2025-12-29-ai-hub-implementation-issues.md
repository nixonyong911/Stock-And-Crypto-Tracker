# AI Hub Implementation Issues

**Context:** AI Hub and back-office deployment to Azure VM.

## Issues & Fixes

### 1. Back-Office API Route Not Found
- **Symptom:** `Cannot POST /api/cursor`
- **Cause:** Next.js `basePath: "/back-office"` prefixes all routes
- **Fix:** Use `${basePath}/api/${agent}` in fetch calls

### 2. Caddy handle_path Stripping basePath
- **Symptom:** Back-office 404 for all pages
- **Cause:** `handle_path` strips prefix before forwarding
- **Fix:** Change to `handle /back-office*` (preserves prefix)

### 3. Claude CLI Read-Only Filesystem
- **Symptom:** `EROFS: read-only file system, open '/home/azureuser/.claude.json'`
- **Cause:** systemd `ProtectHome=read-only`
- **Fix:** Add `/home/azureuser` to `ReadWritePaths`

### 4. Invalid --model Flag for Claude
- **Symptom:** HTTP 500 Internal Server Error
- **Cause:** Claude CLI does NOT support `--model` flag
- **Fix:** Remove `--model` from command construction

### 5. CI/CD Permission Denied
- **Symptom:** `cp: cannot create regular file: Permission denied`
- **Fix:** Add `sudo` for script copies in deploy workflow

### 6. pip3 Externally Managed Environment
- **Symptom:** `error: externally-managed-environment`
- **Cause:** Ubuntu 24.04 PEP 668
- **Fix:** Add `--break-system-packages` flag

### 7. Missing .service File in CI/CD
- **Fix:** Copy `*.service` files in addition to `*.sh`

### 8. Missing class-variance-authority
- **Fix:** `npm install class-variance-authority` for shadcn/ui

## Key Commands

```bash
# Check AI Hub status
sudo systemctl status ai-hub
sudo journalctl -u ai-hub --since "10 min ago"

# Test from container
docker exec back-office wget -qO- http://172.17.0.1:8084/health/live
```

## Lessons Learned

- Test CLIs manually first before integrating
- Check Next.js basePath implications on API routes
- Systemd security settings can block CLIs
- Ubuntu 24.04 pip needs `--break-system-packages`
- Use proper language libraries for HTTP testing (avoid shell escaping)

**Outcome:** AI Hub and back-office deployed successfully.

