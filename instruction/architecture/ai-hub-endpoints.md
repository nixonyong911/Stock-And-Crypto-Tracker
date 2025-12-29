# AI Hub CLI Endpoints

## Overview

AI Hub provides pre-configured CLI endpoints that allow workers to interact with AI agents (claude, cursor-agent) without worrying about configuration details. Each endpoint is a "pre-configured agent" with:

- Fixed context path (instruction folder)
- Fixed CLI tool
- Fixed model/mode

Workers only need to provide the message.

---

## Endpoint Format Convention

```
/<type>/<instruction-folder>/<agent>/<mode>
```

| Segment | Description | Examples |
|---------|-------------|----------|
| `type` | `cli` or `api` | `cli` (CLI-based), `api` (API-based) |
| `instruction-folder` | Folder name → `/mnt/<folder>` | `stock-tracker` → `/home/azureuser/stock-tracker` |
| `agent` | AI agent name | `claude`, `cursor` |
| `mode` | Model/mode variant | `opus-4.5`, `sonnet-4`, `default` |

### Examples

| Endpoint | Context Path | CLI | Mode |
|----------|--------------|-----|------|
| `/cli/stock-tracker/claude/opus-4.5` | `/home/azureuser/stock-tracker` | claude | opus-4.5 |
| `/cli/stock-tracker/cursor/opus-4.5` | `/home/azureuser/stock-tracker` | cursor-agent | opus-4.5 |
| `/cli/new-feature/claude/sonnet-4` | `/mnt/new-feature` | claude | sonnet-4 |

---

## Discovery Endpoint

### GET /cli

Lists all available CLI endpoints.

**Response:**
```json
{
  "format": "/<type>/<instruction-folder>/<agent>/<mode>",
  "endpoints": [
    {
      "path": "/cli/stock-tracker/claude/opus-4.5",
      "instruction_folder": "stock-tracker",
      "context_path": "/home/azureuser/stock-tracker",
      "agent": "claude",
      "mode": "opus-4.5",
      "description": "Stock Tracker analysis with Claude Opus 4.5"
    },
    {
      "path": "/cli/stock-tracker/cursor/opus-4.5",
      "instruction_folder": "stock-tracker",
      "context_path": "/home/azureuser/stock-tracker",
      "agent": "cursor",
      "mode": "opus-4.5",
      "description": "Stock Tracker analysis with Cursor Opus 4.5"
    }
  ],
  "total": 2
}
```

---

## Available Endpoints

### POST /cli/stock-tracker/claude/opus-4.5

Stock Tracker analysis with Claude Opus 4.5.

**Request:**
```json
{
  "message": "Analyze this candlestick pattern..."
}
```

**Response:** Raw text response from Claude.

**Execution:**
```bash
cd /home/azureuser/stock-tracker && claude --model opus-4.5 -p "<message>" --output-format text
```

---

### POST /cli/stock-tracker/cursor/opus-4.5

Stock Tracker analysis with Cursor Opus 4.5.

**Request:**
```json
{
  "message": "Review this code..."
}
```

**Response:** Raw text response from Cursor Agent.

**Execution:**
```bash
cd /home/azureuser/stock-tracker && cursor-agent --model opus-4.5 -p "<message>" --output-format text
```

---

## How Workers Call AI Hub

Workers in Docker containers call AI Hub at `http://172.17.0.1:8084`:

```typescript
// From a worker in Docker container
const AI_HUB_URL = "http://172.17.0.1:8084";

const response = await fetch(`${AI_HUB_URL}/cli/stock-tracker/claude/opus-4.5`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Analyze this pattern..." })
});

const text = await response.text();
```

---

## Adding New Endpoints

### 1. Create Instruction Folder on VM

```bash
ssh azureuser@20.17.176.1
mkdir -p /mnt/new-feature/{agents,skills,context,instruction}
echo "# New Feature Instructions" > /mnt/new-feature/readme.md
```

### 2. Add Endpoint to main.py

```python
# Add to CLI_ENDPOINTS list
CLI_ENDPOINTS.append({
    "path": "/cli/new-feature/claude/sonnet-4",
    "instruction_folder": "new-feature",
    "context_path": "/mnt/new-feature",
    "agent": "claude",
    "mode": "sonnet-4",
    "description": "New Feature analysis with Claude Sonnet 4"
})

# Add endpoint function
@app.post("/cli/new-feature/claude/sonnet-4")
async def cli_new_feature_claude_sonnet4(request: CLIMessageRequest):
    """New Feature + Claude Sonnet 4."""
    executor = get_cli_executor()
    result = await executor.execute(
        cli="claude",
        message=request.message,
        context_path="/mnt/new-feature",
        model="sonnet-4"
    )
    if result.success:
        return result.output
    raise HTTPException(500, detail=result.error)
```

### 3. Deploy

Push changes to trigger CI/CD, or restart ai-hub service on VM:

```bash
sudo systemctl restart ai-hub
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Worker (Docker Container)                                           │
│                                                                     │
│   POST http://172.17.0.1:8084/cli/stock-tracker/claude/opus-4.5     │
│   Body: { "message": "..." }                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI Hub (host:8084, systemd service)                                 │
│                                                                     │
│ Pre-configured:                                                     │
│   - context_path: /home/azureuser/stock-tracker                                │
│   - cli: claude                                                     │
│   - model: opus-4.5                                                 │
│                                                                     │
│ Executes:                                                           │
│   cd /home/azureuser/stock-tracker && claude --model opus-4.5 -p "<msg>"       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     Returns: "<response text>"
```

---

## Error Handling

| HTTP Code | Meaning |
|-----------|---------|
| 200 | Success - returns raw text response |
| 500 | CLI execution failed - check ai-hub logs |

**Check logs:**
```bash
journalctl -u ai-hub -f
```

---

## Testing

```bash
# Discovery endpoint
curl http://localhost:8084/cli

# Test Claude endpoint
curl -X POST http://localhost:8084/cli/stock-tracker/claude/opus-4.5 \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test"}'

# Test Cursor endpoint
curl -X POST http://localhost:8084/cli/stock-tracker/cursor/opus-4.5 \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test"}'
```

