# CaddyManager GUI Setup

**Date**: December 27, 2025  
**Status**: 🔴 NOT COMPLETED - Docker image access denied

## Original Plan

Set up **CaddyManager** - a web-based GUI for managing Caddy configurations, so that:
1. Easy visual management of reverse proxy routes
2. High-level verification of Caddy config
3. Non-technical users can view/modify routes

### Intended Setup

```yaml
# deployment/vm/docker-compose.yml
services:
  caddymanager:
    image: ghcr.io/rhad00/caddymanager:latest
    container_name: caddymanager
    restart: unless-stopped
    environment:
      - CADDY_ADMIN_URL=http://caddy:2019
    networks:
      - stocktracker
```

With Caddy route:
```caddyfile
handle /caddymanager* {
    reverse_proxy caddymanager:80
}
```

## What Went Wrong

When attempting to pull the CaddyManager Docker image:

```bash
docker pull ghcr.io/rhad00/caddymanager:latest
```

**Error received:**
```
Error response from daemon: Head 'https://ghcr.io/v2/rhad00/caddymanager/manifests/latest': denied
```

### Root Cause

The GitHub Container Registry (ghcr.io) image is either:
1. **Private** - Requires authentication to pull
2. **Deleted** - Image no longer exists
3. **Rate limited** - GitHub has pull limits for unauthenticated users

## Attempted Solutions

1. **Direct pull without auth** - Failed (access denied)
2. **Checked GitHub repo** - https://github.com/Rhad00/CaddyManager may be private or archived
3. **Searched for alternatives** - No widely-used Caddy GUI alternatives found

## Current Workaround

Using **Caddy Admin API** via SSH instead of GUI:

```bash
# SSH to VM
ssh-azure

# View current Caddy config
curl localhost:2019/config/ | jq

# View loaded certificates
curl localhost:2019/pki/ca/local | jq

# Reload Caddy config
curl -X POST localhost:2019/load -H "Content-Type: application/json" -d @/etc/caddy/caddy.json
```

## TODO: Resolve CaddyManager Access

### Option 1: Contact Image Owner

1. Find the repository owner (Rhad00)
2. Request public access to the image
3. Or ask for authentication credentials

### Option 2: Build from Source

If the source code is available:

```bash
git clone https://github.com/Rhad00/CaddyManager.git
cd CaddyManager
docker build -t caddymanager:local .
```

### Option 3: Use Alternative GUI

Research alternatives:
- [ ] Check if there's an official Caddy dashboard
- [ ] Look for other Caddy management GUIs
- [ ] Consider using Portainer for container management (includes basic networking view)

### Option 4: Create Simple Status Page

Build a minimal status page that shows:
- Current Caddy routes
- Service health status
- Recent access logs

## Alternative: Portainer

Could use **Portainer** for container management which provides:
- Container status
- Logs
- Network configuration
- Environment variables

```yaml
services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer-data:/data
    networks:
      - stocktracker
```

## Current Status

| Component | Status |
|-----------|--------|
| Caddy reverse proxy | ✅ Working |
| Caddy Admin API | ✅ Accessible via SSH |
| CaddyManager GUI | ❌ Not installed |
| Alternative GUI | ❌ Not configured |

## Related Documents

- [Worker Endpoints](../../cli/caddy/worker-endpoints.md)
- [VM Deployment Architecture](../../architecture/vm-deployment-architecture.md)

## Notes

- CaddyManager is a nice-to-have, not critical
- Caddy Admin API provides full functionality via CLI
- Consider Portainer as a more general container management solution
- Priority: **Low** - CLI works fine for now

