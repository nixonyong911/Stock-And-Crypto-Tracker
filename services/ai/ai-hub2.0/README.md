# AI Hub 2.0

Go-based AI gateway service for executing CLI AI tools (claude, cursor-agent) with high concurrency support.

## Features

- **High Concurrency**: Goroutines for parallel request handling with semaphore-based concurrency limits
- **Context-based Timeout**: Request timeouts propagate through the entire call chain
- **Process Group Cleanup**: Automatic cleanup of subprocess trees on timeout/cancellation
- **Request Logging**: All requests logged to Supabase `logging_ai_hub_request` table
- **API Key Authentication**: X-API-Key header validation

## Architecture

```
Request → Chi Router → Middleware Stack → Semaphore → CLI Executor → CLI Process
                          │
                          ├── Auth (X-API-Key)
                          ├── Logging (to Supabase)
                          └── Timeout (context.WithTimeout)
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `8080` | Server port |
| `AI_HUB_API_KEY` | - | API key for authentication (optional) |
| `AI_HUB_DEFAULT_CONTEXT_PATH` | `/home/azureuser/stock-tracker` | Default CLI context path |
| `AI_HUB_CLI_TIMEOUT_SECONDS` | `120` | CLI execution timeout |
| `AI_HUB_MAX_CONCURRENT` | `3` | Max concurrent CLI executions |
| `DATABASE_URL` | - | PostgreSQL connection string (required) |
| `REDIS_URL` | `redis://redis:6379` | Redis URL (for future use) |

## Endpoints

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health status with DB check |
| `/health/live` | GET | Kubernetes liveness probe |
| `/health/ready` | GET | Kubernetes readiness probe |

### CLI

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cli` | GET | List available CLI endpoints |
| `/cli/stock-tracker/claude/opus-4.5` | POST | Claude CLI |
| `/cli/stock-tracker/cursor/opus-4.5` | POST | Cursor CLI (Opus 4.5) |
| `/cli/telegram-agent/cursor/sonnet-4.5` | POST | Telegram agent (production) |
| `/cli/telegram-agent-test/cursor/sonnet-4.5` | POST | Telegram agent (test) |

### Request Format

```json
{
  "message": "Your prompt here"
}
```

### Response

Plain text response from the AI CLI.

## Docker

### Build

```bash
docker build -t stocktracker-ai-hub2 .
```

### Run

```bash
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://... \
  -e AI_HUB_API_KEY=your-key \
  -v /usr/lib/node_modules/@anthropic-ai:/usr/lib/node_modules/@anthropic-ai:ro \
  -v /home/azureuser/.local/share/cursor-agent:/opt/cursor-agent:ro \
  -v /home/azureuser/.claude-docker:/root/.claude \
  -v /home/azureuser/.claude-mcp.json:/root/.claude-mcp.json:ro \
  -v /home/azureuser/.cursor-docker:/root/.cursor \
  -v /home/azureuser/.config/cursor:/root/.config/cursor \
  -v /home/azureuser/stock-tracker:/home/azureuser/stock-tracker:ro \
  stocktracker-ai-hub2
```

## Testing

```bash
# Health check
curl http://localhost:8080/health/live

# List endpoints
curl http://localhost:8080/cli

# Send message (with API key)
curl -X POST http://localhost:8080/cli/telegram-agent/cursor/sonnet-4.5 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message": "What MCP tools do you have access to?"}'
```

## Development

### Prerequisites

- Go 1.22+
- Docker (for containerized deployment)

### Local Development

```bash
# Download dependencies
go mod download

# Run locally
DATABASE_URL=postgresql://... go run ./cmd/server

# Build
go build -o ai-hub2 ./cmd/server
```

## Migration from Python ai-hub

This service is a drop-in replacement for the Python FastAPI ai-hub. Key improvements:

1. **Better Concurrency**: True parallelism via goroutines vs Python's GIL
2. **Context Propagation**: Timeout cancellation propagates to subprocess
3. **Process Cleanup**: Process groups killed atomically on timeout
4. **Memory Efficiency**: Go's GC vs Python's asyncio overhead

### Breaking Changes

None - all endpoints maintain the same request/response format as Python version.
