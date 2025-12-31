# AI Hub Architecture

## Overview

Centralized Python FastAPI service acting as gateway between microservices and AI CLIs (claude, cursor-agent) running on the Azure VM. **ai-hub runs directly on the VM host** (not in Docker) as a systemd service, providing direct access to CLIs installed on the host.

**Key Benefits:**
- Single point of configuration for AI CLI access
- Direct CLI access (no SSH overhead in production)
- Project-specific context folders on VM
- Response verification before returning to services
- Full request/response logging for debugging and auditing
- Language-agnostic HTTP API consumable by any service
- Docker containers access ai-hub via `172.17.0.1:8084` (Docker bridge gateway)

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Consumer Services (Docker)                       │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│  .NET Workers   │  Next.js Frontend│  Go Services    │  Python Services  │
└────────┬────────┴────────┬─────────┴────────┬────────┴─────────┬─────────┘
         │     HTTP POST to 172.17.0.1:8084 (Docker bridge)     │
         └─────────────────┴──────────────────┴──────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI Hub Service (systemd on HOST)                      │
│                    Port: 8084 (internal only - NOT exposed via Caddy)  │
├─────────────────────────────────────────────────────────────────────────┤
│  /api/chat → CLI Executor → Direct CLI Call → Response Verifier         │
│       │                                                                  │
│       ├── claude CLI (installed on host)                                │
│       ├── cursor-agent CLI (installed on host)                          │
│       └── /home/azureuser/stock-tracker/ (context folder)                          │
│                                                      │                  │
│                                                      ▼                  │
│                                            Supabase PostgreSQL          │
│                                            (ai_hub_logs)                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Production Flow (ai-hub on host):**
```
Docker Service → 172.17.0.1:8084 → ai-hub → direct CLI → Response → Service
```

**Local Dev Flow (ai-hub local + SSH):**
```
Local Service → ai-hub → SSH → VM → CLI → Response → Service
```

---

## VM Context Structure

Project-specific context folders on the Azure VM provide specialized instructions and knowledge for AI CLIs.

```
/home/azureuser/stock-tracker/               # This project's AI context on VM
├── agents/                       # Agent definitions (future sub-agents)
├── skills/                       # Specialized capabilities
├── context/                      # Project context for AI to understand
│   └── project-overview.md       # What this project does
├── instruction/                  # How AI should behave
│   └── coding-conventions.md     # Style rules, patterns
└── readme.md                     # Entry point for AI (read first)
```

**Usage:** When ai-hub executes a CLI command, it `cd`s into the project context folder first:

```bash
cd /home/azureuser/stock-tracker && claude -p "Analyze this candlestick pattern..."
```

This allows the AI CLI to automatically read the context files and understand the project.

---

## Project Structure

```
services/ai/ai-hub/
├── main.py                     # FastAPI app, endpoints, lifecycle
├── config.py                   # Model registry, SSH config, VM paths
├── schemas.py                  # Pydantic request/response models
├── models/
│   ├── base.py                 # Abstract base: CLIModelClient
│   ├── registry.py             # Model routing and client caching
│   ├── anthropic/
│   │   └── claude.py           # Claude CLI client implementation
│   └── cursor/
│       └── cursor_agent.py     # Cursor-agent CLI client implementation
├── services/
│   ├── cli_executor.py         # SSH connection and CLI execution
│   ├── response_verifier.py    # Validate AI responses
│   └── logger.py               # Database logging
├── db/connection.py            # Async PostgreSQL connection pool
├── Dockerfile
└── requirements.txt
```

---

## Model ID Naming Convention

**Format:** `cli-<username>-<company>-<model>`

| Field | Description | Examples |
|-------|-------------|----------|
| type | Always `cli` for CLI-based | cli |
| username | Account/context identifier | nixon, stocktracker |
| company | AI provider | anthropic, cursor |
| model | CLI/model name | claude, cursor-agent |

**Examples:**
- `cli-nixon-anthropic-claude` - Claude CLI with nixon's context
- `cli-stocktracker-cursor-agent` - Cursor agent for stock tracker

---

## Configuration

### Execution Modes (CLI Prefix Pattern)

ai-hub uses a **CLI prefix pattern** to abstract the connection method between environments:

| Environment | `AI_HUB_CLI_PREFIX` | Result |
|-------------|---------------------|--------|
| **Production** | Empty (`""`) | Direct CLI execution on host |
| **Local Dev** | SSH command | CLI execution via SSH |

**Production (prefix empty, ai-hub runs on VM host):**
```bash
# AI_HUB_CLI_PREFIX=""
cd "/home/azureuser/stock-tracker/" && claude -p "message"
```

**Local Development (prefix = SSH command):**
```bash
# AI_HUB_CLI_PREFIX="ssh -i ~/.ssh/key.pem azureuser@20.17.176.1"
ssh -i ~/.ssh/key.pem azureuser@20.17.176.1 'cd "/home/azureuser/stock-tracker/" && claude -p "message"'
```

**How It Works:**
The CLI executor prepends the prefix to all commands:
```
<AI_HUB_CLI_PREFIX> '<cd context && cli command>'
```

This allows the same ai-hub code to work in both environments - only the secret changes.

---

### Default Context Directory

**Default:** `/home/azureuser/stock-tracker/`

All AI CLI commands are executed from this directory by default. This ensures the AI has access to project context files.

**Command Pattern:**
```bash
cd "/home/azureuser/stock-tracker/" && <cli> -p "<message>"
```

**Examples:**
```bash
# Claude CLI
cd "/home/azureuser/stock-tracker/" && claude -p "Analyze this candlestick pattern..."

# Cursor Agent
cd "/home/azureuser/stock-tracker/" && cursor-agent -p "Review recent code changes..."
```

When adding new endpoints to ai-hub, always use this pattern to ensure consistent context access.

---

### Environment Variables

```bash
# ===========================================
# CLI Prefix (key abstraction for local vs production)
# ===========================================
AI_HUB_CLI_PREFIX=                    # Empty for production, SSH cmd for local dev
AI_HUB_DEFAULT_CONTEXT_PATH=/home/azureuser/stock-tracker
AI_HUB_CLI_TIMEOUT_SECONDS=120        # CLI calls can take longer than API calls

# ===========================================
# Database
# ===========================================
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### Environment by Deployment

| Variable | Local Dev | Production |
|----------|-----------|------------|
| `AI_HUB_CLI_PREFIX` | `ssh -i ~/.ssh/key.pem azureuser@20.17.176.1` | Empty (`""`) |
| `AI_HUB_DEFAULT_CONTEXT_PATH` | `/home/azureuser/stock-tracker` | `/home/azureuser/stock-tracker` |
| `DATABASE_URL` | From Infisical | From Infisical |

### Infisical Secrets

| Secret | Environment | Purpose |
|--------|-------------|---------|
| `AI_HUB_CLI_PREFIX` | Local (staging) | SSH command for remote CLI access |
| `AI_HUB_CLI_PREFIX` | Production | Empty (direct CLI on host) |

> **Note:** CLI authentication (ANTHROPIC_API_KEY, etc.) is already configured on the VM host.
> ai-hub does not need API keys - CLIs are pre-authenticated.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Main AI interaction endpoint |
| `/api/models` | GET | List registered CLI models |
| `/api/stats?hours=24` | GET | Usage statistics |
| `/api/errors?limit=50` | GET | Recent error logs |
| `/health` | GET | Health check with DB and VM status |
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness probe (checks SSH connectivity) |

### POST /api/chat

**Request:**
```json
{
  "model_id": "cli-nixon-anthropic-claude",
  "message": "Analyze this candlestick pattern...",
  "system_prompt": "You are a technical trading analyst.",
  "caller_service": "twelvedata-worker"
}
```

> **Note:** All requests use the default context path `/home/azureuser/stock-tracker/`. No need to specify `context_path` unless overriding.

**Success Response (200):**
```json
{
  "success": true,
  "request_id": "uuid",
  "response": "The candlestick shows a bullish hammer pattern...",
  "cli_used": "claude",
  "execution_time_ms": 3500,
  "context_path": "/home/azureuser/stock-tracker"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "CLI execution failed",
  "error_code": "CLI_EXECUTION_ERROR",
  "details": "SSH connection timeout"
}
```

---

## CLI Execution Flow

### 1. Request Received
Service sends POST to `/api/chat` with model_id and message.

### 2. Model Resolution
ai-hub looks up CLI configuration for the model_id.

### 3. CLI Execution
ai-hub executes the CLI command using the prefix pattern:

**Command Template:**
```bash
<AI_HUB_CLI_PREFIX> 'cd "/home/azureuser/stock-tracker/" && <cli> -p "<message>" --output-format text'
```

**Production (prefix empty - direct execution):**
```bash
cd "/home/azureuser/stock-tracker/" && claude -p "Your prompt here" --output-format text
```

**Local Dev (prefix = SSH):**
```bash
ssh -i key.pem user@host 'cd "/home/azureuser/stock-tracker/" && claude -p "Your prompt here" --output-format text'
```

> **Important:** Always use this `cd` pattern when adding new AI endpoints to ensure CLI has access to project context.

### 4. Response Capture
Captures stdout/stderr from CLI execution.

### 5. Response Verification
ai-hub validates the response (non-empty, no error markers).

### 6. Return to Service
Returns verified response to calling service.

---

## Adding New CLI Models

### 1. Install CLI on VM

```bash
# SSH to VM
ssh -i key.pem azureuser@20.17.176.1

# Install new CLI (example: new-ai-cli)
curl https://new-ai.com/install | bash
```

### 2. Create Project Context Folder (if new project)

```bash
mkdir -p /mnt/new-project/{agents,skills,context,instruction}
echo "# New Project" > /mnt/new-project/readme.md
```

### 3. Add Environment Variables

```bash
AI_HUB_MODELS=cli-nixon-anthropic-claude,cli-newproject-newai-newcli
```

### 4. Create Client Class (if new provider)

```python
# models/newai/newcli.py
from models.base import CLIModelClient, CLIResponse

class NewCLIClient(CLIModelClient):
    def build_command(self, message: str, system_prompt: str = None) -> str:
        cmd = f'new-ai-cli -p "{message}"'
        if system_prompt:
            cmd += f' --system "{system_prompt}"'
        return cmd
```

### 5. Register in Model Registry

```python
# models/registry.py
def _create_client(self, config: ModelConfig):
    if config.company == "anthropic":
        return ClaudeClient(...)
    elif config.company == "cursor":
        return CursorAgentClient(...)
    elif config.company == "newai":
        return NewCLIClient(...)  # Add new provider
```

---

## Error Handling

### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `MODEL_NOT_FOUND` | Model ID not in registry | Check model_id spelling |
| `SSH_CONNECTION_ERROR` | Cannot connect to VM | Check VM status, SSH key |
| `CLI_NOT_FOUND` | CLI not installed on VM | Install CLI on VM |
| `CLI_EXECUTION_ERROR` | CLI returned error | Check CLI logs on VM |
| `CONTEXT_PATH_ERROR` | Context folder not found | Create folder on VM |
| `TIMEOUT_ERROR` | CLI execution timeout | Increase timeout or simplify prompt |
| `RESPONSE_EMPTY` | CLI returned empty response | Check CLI authentication |

### Retry Strategy

| Error Type | Strategy | Max Retries |
|------------|----------|-------------|
| SSH timeout | Reconnect | 2 |
| CLI timeout | None (expensive) | 0 |
| Empty response | Retry with same prompt | 1 |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "SSH connection refused" | Check VM is running, port 22 open, SSH key valid |
| "CLI not found" | SSH to VM, verify CLI installed: `which claude` |
| "Context path not found" | Create folder: `mkdir -p /home/azureuser/stock-tracker` |
| "Empty response" | Check CLI auth: `claude --version` on VM |
| "Timeout" | Increase `AI_HUB_TIMEOUT_SECONDS`, simplify prompt |
| "Permission denied" | Check SSH key permissions (600), VM user |

### Debug Commands

```bash
# Test SSH connection
ssh -i key.pem azureuser@20.17.176.1 "echo 'SSH OK'"

# Test CLI on VM
ssh -i key.pem azureuser@20.17.176.1 "claude --version"
ssh -i key.pem azureuser@20.17.176.1 "cursor-agent --version"

# Test with default context directory
ssh -i key.pem azureuser@20.17.176.1 'cd "/home/azureuser/stock-tracker/" && claude -p "Hello"'
ssh -i key.pem azureuser@20.17.176.1 'cd "/home/azureuser/stock-tracker/" && cursor-agent -p "Hello"'
```

---

## Deployment

### Production Architecture

ai-hub runs **directly on the VM host** (not in Docker) as a systemd service:

```
Azure VM Host
├── systemd: ai-hub.service (port 8084)
│   ├── FastAPI app
│   ├── Direct access to claude, cursor-agent CLIs
│   ├── API key authentication (X-API-Key header)
│   └── Direct access to /home/azureuser/stock-tracker/
│
├── Docker Compose
│   ├── Caddy (reverse proxy)
│   │   └── NOTE: ai-hub NOT exposed publicly (internal only)
│   ├── TwelveData Worker → host.docker.internal:8084
│   ├── Metrics Service → host.docker.internal:8084
│   ├── back-office → host.docker.internal:8084
│   └── n8n → host.docker.internal:8084
│
└── CLIs (installed on host)
    ├── claude
    └── cursor-agent
```

**Security:** ai-hub is NOT exposed via Caddy. Only Docker containers can access it via `host.docker.internal:8084` with a valid `X-API-Key` header.

### Service Files

| File | Location | Purpose |
|------|----------|---------|
| `ai-hub.service` | `/etc/systemd/system/` | Systemd unit file |
| `ai-hub.env` | `/etc/ai-hub.env` | Environment variables |
| App code | `/app/repo/services/ai/ai-hub/` | Python source |

### Management Commands

```bash
# SSH to VM
ssh-azure  # or: ssh -i key.pem azureuser@20.17.176.1

# Service management
sudo systemctl status ai-hub
sudo systemctl restart ai-hub
sudo systemctl stop ai-hub

# View logs
journalctl -u ai-hub -f
journalctl -u ai-hub --since "10 min ago"

# Test endpoint
curl http://localhost:8084/health/live
```

---

## VM Details

| Property | Value |
|----------|-------|
| Host | 20.17.176.1 |
| User | azureuser |
| FQDN | nxserver.malaysiawest.cloudapp.azure.com |
| SSH Port | 22 |
| CLIs Installed | claude (2.0.76), cursor-agent (2025.12.17) |
| **Default Context Path** | `/home/azureuser/stock-tracker/` |
| **AI Hub Port** | 8084 (host, internal only) |
| **Docker Access** | `host.docker.internal:8084` + `X-API-Key` header |

**CLI Execution Pattern:**
```bash
cd "/home/azureuser/stock-tracker/" && <cli> -p "<message>"
```

---

## Consumer Services

### Back-Office (Docker Container)

Test UI for AI Hub endpoints. Runs in Docker, calls AI Hub via Docker bridge.

| Property | Value |
|----------|-------|
| Location | `services/back-office/` |
| Runtime | Next.js 16 with shadcn/ui |
| Port | 3000 (container) |
| Public URL | `https://nxserver.malaysiawest.cloudapp.azure.com/back-office` |

**Architecture:**
```
Browser → Caddy → back-office container → AI Hub (host)
                         │
                         ▼
              http://host.docker.internal:8084
              + X-API-Key: <AI_HUB_API_KEY>
```

**Key Files:**

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main UI with message input |
| `src/app/api/claude/route.ts` | API route proxying to AI Hub |
| `next.config.ts` | `basePath: "/back-office"` |
| `Dockerfile` | Multi-stage build |

**API Route Example:**
```typescript
const AI_HUB_URL = process.env.AI_HUB_URL || "http://host.docker.internal:8084";
const AI_HUB_API_KEY = process.env.AI_HUB_API_KEY || "";

export async function POST(req: Request) {
  const { message } = await req.json();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (AI_HUB_API_KEY) {
    headers["X-API-Key"] = AI_HUB_API_KEY;
  }
  
  const response = await fetch(
    `${AI_HUB_URL}/cli/stock-tracker/claude/opus-4.5`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
    }
  );
  
  return new Response(await response.text(), {
    headers: { "Content-Type": "text/plain" },
  });
}
```

### Caddy Configuration

```caddyfile
# NOTE: ai-hub is NOT exposed via Caddy (internal only)
# Containers access it via host.docker.internal:8084 + X-API-Key header

# Back-office (Docker container) - use handle, not handle_path
handle /back-office* {
    reverse_proxy back-office:3000
}
```

> **Security:** ai-hub is intentionally NOT exposed via Caddy. Only internal Docker containers can access it using `host.docker.internal:8084` with a valid API key.

---

## CI/CD Deployment

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

## CLI Limitations

### Claude CLI

- **No `--model` flag** - Model determined by user's Claude subscription (Pro = Opus, Free = Sonnet)
- Use `--output-format text` for plain text responses

```bash
# Correct - no model flag
claude -p "message" --output-format text

# WRONG - will error
claude --model opus-4.5 -p "message"
```

---

## Future Improvements

- [ ] Sub-agent orchestration
- [ ] Response caching for repeated queries
- [ ] WebSocket streaming for real-time responses
- [ ] Multiple VM support for load balancing
- [ ] Agent-specific context folders per task type
