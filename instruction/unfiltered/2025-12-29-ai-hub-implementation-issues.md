# AI Hub Implementation - Issues & Fixes

**Date**: 2025-12-29  
**Session**: AI Hub CLI Architecture Implementation

---

## Summary

This document captures all issues encountered during the AI Hub and back-office implementation, along with their root causes and fixes.

---

## Issue 1: Back-Office API Route Not Found

### Symptom
```
Error: <!DOCTYPE html>...
<pre>Cannot POST /api/cursor</pre>
```

### Root Cause
Next.js `basePath: "/back-office"` prefixes all routes including API routes. The frontend was calling `/api/cursor` but the actual route was `/back-office/api/cursor`.

### Fix
Updated `src/app/page.tsx` to include basePath in fetch calls:

```typescript
// Before
const res = await fetch(`/api/${agent}`, {...});

// After
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/back-office";
const res = await fetch(`${basePath}/api/${agent}`, {...});
```

### Related Files
- `services/back-office/src/app/page.tsx`
- `services/back-office/next.config.ts`

---

## Issue 2: Caddy handle_path Stripping basePath

### Symptom
Back-office returns 404 for all pages when accessed via Caddy.

### Root Cause
Using `handle_path /back-office/*` strips the `/back-office` prefix before forwarding to Next.js. But Next.js expects the basePath to be present.

### Fix
Changed Caddy configuration from `handle_path` to `handle`:

```caddyfile
# Before (strips prefix)
handle_path /back-office/* {
    reverse_proxy back-office:3000
}

# After (preserves prefix)
handle /back-office* {
    reverse_proxy back-office:3000
}
```

### Related Files
- `deployment/vm/Caddyfile`

---

## Issue 3: Claude CLI Read-Only Filesystem Error

### Symptom
```
Error: EROFS: read-only file system, open '/home/azureuser/.claude.json'
```

### Root Cause
The systemd service had `ProtectHome=read-only` which prevented Claude CLI from writing its configuration file.

### Fix
Removed `ProtectHome=read-only` and added home directory to `ReadWritePaths`:

```ini
# Before
ProtectHome=read-only
ReadWritePaths=/home/azureuser/stock-tracker /tmp

# After
ReadWritePaths=/home/azureuser/stock-tracker /tmp /home/azureuser
```

### Related Files
- `deployment/vm/scripts/ai-hub.service`

---

## Issue 4: Invalid --model Flag for Claude CLI

### Symptom
```
HTTP Error: 500
{"detail":"Internal Server Error"}
```

### Root Cause
Claude Code CLI does NOT support a `--model` flag. The model is determined by the user's Claude subscription (Pro = Opus, Free = Sonnet).

We were passing `--model opus-4.5` which is invalid.

### Fix
Removed `--model` flag from Claude CLI command construction:

```python
# Before
if cli == "claude":
    if model:
        return f'claude --model {model} -p "{escaped_message}" --output-format {output_format}'

# After
if cli == "claude":
    # Claude Code CLI doesn't support --model flag
    return f'claude -p "{escaped_message}" --output-format {output_format}'
```

### Related Files
- `services/ai/ai-hub/services/cli_executor.py`

---

## Issue 5: CI/CD Permission Denied on Script Copy

### Symptom
```
cp: cannot create regular file '/opt/stocktracker/scripts/start-ai-hub.sh': Permission denied
```

### Root Cause
The `start-ai-hub.sh` script was manually created with root permissions during initial setup. The CI/CD user (`azureuser`) couldn't overwrite it.

### Fix
Added `sudo` for copying scripts in the CI/CD workflow:

```yaml
# Before
cp $DEPLOY_PATH/repo/deployment/vm/scripts/*.sh $DEPLOY_PATH/scripts/

# After
sudo cp $DEPLOY_PATH/repo/deployment/vm/scripts/*.sh $DEPLOY_PATH/scripts/
sudo chmod +x $DEPLOY_PATH/scripts/*.sh
```

### Related Files
- `.github/workflows/deploy-vm.yml`

---

## Issue 6: pip3 Externally Managed Environment

### Symptom
```
error: externally-managed-environment
This environment is externally managed
```

### Root Cause
Ubuntu 24.04 uses PEP 668 which prevents pip from installing packages into the system Python by default.

### Fix
Added `--break-system-packages` flag:

```bash
# Before
pip3 install --user -q -r requirements.txt

# After
pip3 install --user -q --break-system-packages -r requirements.txt
```

### Related Files
- `.github/workflows/deploy-vm.yml`

---

## Issue 7: Missing .service File in CI/CD

### Symptom
```
cp: cannot stat '/opt/stocktracker/scripts/ai-hub.service': No such file or directory
```

### Root Cause
The CI/CD script only copied `.sh` files from `deployment/vm/scripts/`, missing the `.service` file.

### Fix
Updated the copy command to include `.service` files:

```bash
# Before
sudo cp $DEPLOY_PATH/repo/deployment/vm/scripts/*.sh $DEPLOY_PATH/scripts/

# After
sudo cp $DEPLOY_PATH/repo/deployment/vm/scripts/*.sh $DEPLOY_PATH/scripts/
sudo cp $DEPLOY_PATH/repo/deployment/vm/scripts/*.service $DEPLOY_PATH/scripts/
```

### Related Files
- `.github/workflows/deploy-vm.yml`

---

## Issue 8: Missing class-variance-authority Dependency

### Symptom
```
Module not found: Can't resolve 'class-variance-authority'
```

### Root Cause
shadcn/ui Button component requires `class-variance-authority` but it wasn't in `package.json`.

### Fix
Added the dependency:

```bash
npm install class-variance-authority
```

### Related Files
- `services/back-office/package.json`

---

## Issue 9: Generic "Internal Server Error" Response

### Symptom
AI Hub returns `{"detail":"Internal Server Error"}` without useful error details.

### Root Cause
The CLI endpoint error handling didn't include actual error message:

```python
raise HTTPException(500, detail=result.error)  # result.error might be None
```

### Fix
Improved error handling to include more details:

```python
try:
    result = await executor.execute(...)
    if result.success:
        return result.output
    error_detail = result.error or result.output or "Unknown CLI error"
    logger.error("Claude CLI failed", error=error_detail, exit_code=result.exit_code)
    raise HTTPException(500, detail=error_detail)
except Exception as e:
    logger.error("Claude endpoint error", error=str(e))
    raise HTTPException(500, detail=str(e))
```

### Related Files
- `services/ai/ai-hub/main.py`

---

## Issue 10: JSON Parsing Errors in SSH Commands

### Symptom
```
{"detail":[{"type":"json_invalid","loc":["body",10],"msg":"JSON decode error","input":{},"ctx":{"error":"Invalid \\escape"}}]}
```

### Root Cause
Multi-layer shell escaping (PowerShell → SSH → bash → curl) mangles JSON. Characters like `"` get escaped multiple times.

### Workaround
- Use Python scripts for testing (proper JSON encoding)
- Test from browser (no escaping issues)
- Create temporary JSON files on the VM

### Example Working Test

```python
#!/usr/bin/env python3
import urllib.request
import json

data = json.dumps({"message": "hello"}).encode('utf-8')
req = urllib.request.Request(
    "http://172.17.0.1:8084/cli/stock-tracker/claude/opus-4.5",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(req) as resp:
    print(resp.read().decode())
```

---

## Lessons Learned

1. **Test CLIs manually first** - Always verify CLI flags and behavior before integrating
2. **Check Next.js basePath implications** - Affects API routes, not just pages
3. **Systemd security settings can block CLIs** - Be careful with `ProtectHome`, `ProtectSystem`
4. **Ubuntu 24.04 pip changes** - Need `--break-system-packages` or use venv
5. **Shell escaping is fragile** - Use proper language libraries for HTTP testing
6. **Include all file types in CI/CD copies** - Don't assume only `.sh` files exist
7. **Always include error details** - Never return generic "Internal Server Error"

---

## Verification Commands

```bash
# Check AI Hub status
sudo systemctl status ai-hub

# View AI Hub logs
sudo journalctl -u ai-hub --since "10 min ago"

# Test AI Hub endpoint
curl http://localhost:8084/cli

# Test Claude endpoint (use Python for proper JSON)
python3 -c "
import urllib.request, json
data = json.dumps({'message': 'hi'}).encode()
req = urllib.request.Request('http://127.0.0.1:8084/cli/stock-tracker/claude/opus-4.5', data, {'Content-Type': 'application/json'}, method='POST')
print(urllib.request.urlopen(req, timeout=60).read().decode()[:100])
"

# Check container connectivity
docker exec back-office wget -qO- http://172.17.0.1:8084/health/live
```

