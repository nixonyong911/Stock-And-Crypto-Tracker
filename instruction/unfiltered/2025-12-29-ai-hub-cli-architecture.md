# AI Hub CLI Architecture - Implementation Notes

**Date**: 2025-12-29  
**Status**: Implemented and deployed  
**Services**: `ai-hub` (host service), `back-office` (Docker container)

---

## Overview

AI Hub is a centralized gateway service that allows Docker container workers to interact with AI CLIs (Claude Code, Cursor Agent) installed on the Azure VM host. Instead of each service managing its own AI CLI connections, workers send simple messages to AI Hub, which handles CLI execution, context management, and response routing.

### Key Design Decisions

1. **AI Hub runs directly on VM host** (not in Docker) - required for direct CLI access
2. **CLIs installed on VM host** - Claude Code and cursor-agent are installed globally
3. **Container-to-host communication** via Docker bridge IP `172.17.0.1`
4. **Pre-configured endpoints** - Workers only provide messages, AI Hub handles CLI configuration
5. **Infisical for secrets** - Injected at runtime via Machine Identity

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Azure VM (Host)                             │
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────────────────────────┐   │
│  │   Docker        │     │   Host Services                     │   │
│  │                 │     │                                     │   │
│  │ ┌─────────────┐ │     │  ┌─────────────┐  ┌──────────────┐ │   │
│  │ │ back-office │ │────▶│  │   AI Hub    │  │ Claude CLI   │ │   │
│  │ │  (Next.js)  │ │     │  │  (FastAPI)  │──│              │ │   │
│  │ └─────────────┘ │     │  │  port 8084  │  └──────────────┘ │   │
│  │                 │     │  │             │                    │   │
│  │ ┌─────────────┐ │     │  │             │  ┌──────────────┐ │   │
│  │ │ twelvedata  │ │────▶│  │             │──│ cursor-agent │ │   │
│  │ └─────────────┘ │     │  └─────────────┘  └──────────────┘ │   │
│  │                 │     │                                     │   │
│  │ ┌─────────────┐ │     │  Context: /mnt/stock-tracker/       │   │
│  │ │   metrics   │ │     │  ├── agents/                        │   │
│  │ └─────────────┘ │     │  ├── skills/                        │   │
│  │                 │     │  ├── context/                       │   │
│  │ ┌─────────────┐ │     │  └── instruction/                   │   │
│  │ │    caddy    │ │     │                                     │   │
│  │ └─────────────┘ │     └─────────────────────────────────────┘   │
│  └─────────────────┘                                               │
│         │                           │                               │
│         │ 172.17.0.1:8084           │                               │
│         └───────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Services

### 1. AI Hub (Host Service)

**Location**: `services/ai/ai-hub/`  
**Runtime**: Python FastAPI, runs directly on VM host via systemd  
**Port**: 8084  
**Purpose**: Gateway to AI CLIs with pre-configured endpoints

#### Systemd Service

```bash
# Service file location
/etc/systemd/system/ai-hub.service

# Management commands
sudo systemctl status ai-hub
sudo systemctl restart ai-hub
sudo journalctl -u ai-hub -f
```

#### Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app with CLI endpoints |
| `services/cli_executor.py` | Executes CLI commands |
| `config.py` | Environment configuration |
| `schemas.py` | Pydantic models including `CLIMessageRequest` |

#### Endpoint Format

```
/<type>/<instruction-folder>/<agent>/<mode>
```

| Segment | Description | Examples |
|---------|-------------|----------|
| `type` | Technology type | `cli`, `api` |
| `instruction-folder` | Context folder name (maps to `/mnt/<folder>`) | `stock-tracker` |
| `agent` | AI CLI to use | `claude`, `cursor` |
| `mode` | Model/mode variant | `opus-4.5`, `sonnet-4` |

#### Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /cli` | Discovery - list all CLI endpoints |
| `GET /health/live` | Liveness probe |
| `POST /cli/stock-tracker/claude/opus-4.5` | Claude with stock-tracker context |
| `POST /cli/stock-tracker/cursor/opus-4.5` | Cursor with stock-tracker context |

#### Request Format

```json
POST /cli/stock-tracker/claude/opus-4.5
Content-Type: application/json

{
  "message": "Analyze the stock prices table"
}
```

#### Response Format

Returns raw CLI output as plain text:

```
I'll help you analyze the stock_prices table...
```

---

### 2. Back-Office (Docker Container)

**Location**: `services/back-office/`  
**Runtime**: Next.js 16 with shadcn/ui  
**Purpose**: Web UI for testing AI Hub endpoints  
**URL**: https://nxserver.malaysiawest.cloudapp.azure.com/back-office

#### Architecture

```
Browser → Caddy → back-office container → AI Hub (host)
                         │
                         ▼
              http://172.17.0.1:8084
```

#### Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI with message input and response display |
| `src/app/api/claude/route.ts` | API route that proxies to AI Hub |
| `src/app/api/cursor/route.ts` | API route that proxies to AI Hub |
| `next.config.ts` | Configures `basePath: "/back-office"` |
| `Dockerfile` | Multi-stage build for production |

#### API Route Example

```typescript
// src/app/api/claude/route.ts
const AI_HUB_URL = process.env.AI_HUB_URL || "http://172.17.0.1:8084";

export async function POST(req: Request) {
  const { message } = await req.json();
  
  const response = await fetch(
    `${AI_HUB_URL}/cli/stock-tracker/claude/opus-4.5`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );
  
  const text = await response.text();
  return new Response(text, {
    headers: { "Content-Type": "text/plain" },
  });
}
```

#### Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `AI_HUB_URL` | `http://172.17.0.1:8084` | AI Hub host address |

---

## Container-to-Host Communication

### Docker Bridge Network

Docker containers can communicate with services on the host using the Docker bridge gateway IP:

```
172.17.0.1  →  Host machine
```

### Configuration

In `deployment/vm/docker-compose.yml`:

```yaml
back-office:
  build:
    context: ./repo/services/back-office
  container_name: back-office
  restart: unless-stopped
  environment:
    - AI_HUB_URL=http://172.17.0.1:8084
  networks:
    - stocktracker
```

### Verification

From inside any container:
```bash
docker exec back-office wget -qO- http://172.17.0.1:8084/health/live
# Returns: {"status":"ok"}
```

---

## CLI Executor

The `CLIExecutor` class handles command construction and execution:

### Command Building

```python
# For Claude (no --model flag supported)
claude -p "your message" --output-format text

# For Cursor (may support --model)
cursor-agent -p "your message"
```

### Execution Flow

1. Build CLI command with escaped message
2. `cd` to context directory (`/mnt/stock-tracker`)
3. Execute via `asyncio.create_subprocess_shell`
4. Capture stdout/stderr
5. Return `CLIResult` with output or error

### Important Notes

- **Claude CLI does NOT support `--model` flag** - model determined by account settings
- **Timeout**: 120 seconds (configurable)
- **Context path**: `/mnt/stock-tracker` (default)

---

## VM Context Structure

```
/mnt/stock-tracker/
├── agents/       # Future: AI agent configurations
├── skills/       # Future: Reusable skill definitions
├── context/      # Future: Project context files
├── instruction/  # Future: Instruction documents
└── readme.md     # Placeholder
```

The CLI `cd`s into this directory before executing, giving the AI agent access to project-specific context.

---

## Caddy Configuration

```caddyfile
# AI Hub (proxied to host service)
handle_path /api/ai-hub/* {
    reverse_proxy 172.17.0.1:8084
}

# Back-office (Docker container)
handle /back-office* {
    reverse_proxy back-office:3000
}
```

**Note**: `handle` (not `handle_path`) is used for back-office to preserve the `basePath` for Next.js routing.

---

## CI/CD Integration

### Deployment Flow

```
Push to main
    │
    ▼
GitHub Actions (deploy-vm.yml)
    │
    ├── Build Docker services (twelvedata, metrics, back-office)
    │
    ├── Deploy AI Hub (host service)
    │   ├── Install Python dependencies
    │   ├── Copy systemd service file
    │   ├── Reload systemd daemon
    │   └── Restart ai-hub service
    │
    └── Start Docker services with Infisical secrets
```

### AI Hub Deployment Script

```yaml
- name: Deploy AI Hub (host service)
  run: |
    ssh azureuser@20.17.176.1 'bash -s' << 'EOF'
    pip3 install --user -q --break-system-packages -r requirements.txt
    sudo cp ai-hub.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable ai-hub
    sudo systemctl restart ai-hub
    EOF
```

---

## Troubleshooting

### Check AI Hub Status

```bash
sudo systemctl status ai-hub
sudo journalctl -u ai-hub --since "10 min ago"
```

### Test AI Hub Directly

```bash
curl -X POST http://172.17.0.1:8084/cli/stock-tracker/claude/opus-4.5 \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

### Test from Container

```bash
docker exec back-office wget -qO- http://172.17.0.1:8084/cli
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "read-only file system" | systemd `ProtectHome=read-only` | Add `/home/azureuser` to `ReadWritePaths` |
| "Cannot POST /api/cursor" | Missing basePath in fetch | Use `${basePath}/api/cursor` |
| 500 Internal Server Error | CLI execution failed | Check `journalctl -u ai-hub` for details |
| 422 Unprocessable Entity | JSON parsing error | Ensure proper Content-Type and JSON format |

---

## Security Considerations

1. **AI Hub binds to 0.0.0.0:8084** - Only accessible from Docker bridge and localhost
2. **Systemd hardening**: `NoNewPrivileges=true`, `ProtectSystem=strict`
3. **Secrets via Infisical** - Never hardcoded
4. **ReadWritePaths** limited to `/mnt/stock-tracker`, `/tmp`, `/home/azureuser`

---

## Future Enhancements

1. **Add more endpoints** for different contexts (`/cli/new-feature/claude/...`)
2. **Implement cursor-agent** endpoints (currently untested)
3. **Add streaming responses** for long-running CLI operations
4. **Populate context folders** with actual agent/skill configurations
5. **Add authentication** between workers and AI Hub
6. **Rate limiting** for CLI endpoints

---

## Related Documentation

- `instruction/architecture/ai-hub-architecture.md` - High-level architecture
- `instruction/architecture/ai-hub-endpoints.md` - Endpoint format convention
- `instruction/cli/AI/claude-code.md` - Claude CLI usage
- `instruction/cli/AI/cursor-agent.md` - Cursor Agent CLI usage
- `instruction/cli/caddy/worker-endpoints.md` - Caddy reverse proxy routes

