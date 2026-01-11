---
name: analysis-mcp
description: Guide for maintaining and extending the Analysis MCP server at services/mcp. Use when adding new MCP tools, debugging MCP issues, testing MCP locally, or understanding the candlestick analysis MCP architecture.
---

# Analysis MCP Server

The Analysis MCP server provides AI agents with read-only access to candlestick pattern analysis data from the Stock Tracker database.

## Architecture

```
services/mcp/
├── server.py          # FastMCP server entry point, tool definitions
├── config.py          # Database connection pool, environment config
├── requirements.txt   # Python dependencies (fastmcp, asyncpg, pydantic)
├── Dockerfile         # Docker build for VM deployment
└── tools/
    ├── __init__.py    # Tool exports
    └── analysis.py    # Database query implementations
```

### Data Flow

```
Cursor/AI Agent
      │
      ▼ (MCP Protocol)
┌─────────────────┐
│   server.py     │  ← Tool definitions with Pydantic input models
│   (FastMCP)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  tools/analysis │  ← SQL queries, JSON response formatting
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   config.py     │  ← asyncpg connection pool
└────────┬────────┘
         │
         ▼
    PostgreSQL
    (Supabase)
```

### Transport Modes

| Mode | Flag | Use Case |
|------|------|----------|
| HTTP | (default) | VM/Docker deployment on port 8085 |
| stdio | `--stdio` | Local Cursor MCP integration |

## Available Tools

Track tools in `server.py` - each `@mcp.tool()` decorator defines a tool.

| Tool | Description | Input |
|------|-------------|-------|
| `analysis_get_stock` | Query candlestick analysis for a symbol | symbol, start_date, end_date |
| `analysis_list_patterns` | List detected patterns for a date | analysis_date, pattern_type? |
| `analysis_get_bullish` | Get stocks with bullish patterns | analysis_date |
| `analysis_get_bearish` | Get stocks with bearish patterns | analysis_date |
| `analysis_get_statistics` | Aggregate pattern stats over N days | days (1-90) |

## Testing Methods

### Local Testing (Recommended for Development)

1. **Prerequisites**: Infisical CLI logged in, Python dependencies installed

2. **Quick test** (verify imports):
```powershell
cd services/mcp
infisical run --env=prod -- python -c "from server import mcp; print('OK')"
```

3. **Cursor MCP integration** - Add to `mcp.json`:
```json
{
  "mcpServers": {
    "analysis_mcp": {
      "command": "infisical",
      "args": ["run", "--env=prod", "--", "python", "server.py", "--stdio"],
      "cwd": "C:\\path\\to\\services\\mcp"
    }
  }
}
```

4. **Test via AI**: Ask Cursor to call analysis tools (e.g., "Get pattern statistics for last 7 days")

### VM Testing (Production)

After pushing changes:
1. `gh run watch` - Wait for CI/CD
2. SSH to VM: `docker logs mcp-analysis` - Check for errors
3. Health check: `curl http://localhost:8085/health`

## Adding New Tools

### Step 1: Define Input Model in `server.py`

```python
class NewToolInput(BaseModel):
    """Input for new tool."""
    param: str = Field(..., description="Parameter description")
    
    @field_validator('param')
    @classmethod
    def validate_param(cls, v: str) -> str:
        # validation logic
        return v
```

### Step 2: Create Query Function in `tools/analysis.py`

```python
async def new_tool_query(param: str) -> str:
    query = """
        SELECT ... FROM ... WHERE ...
    """
    async with get_connection() as conn:
        rows = await conn.fetch(query, param)
    
    return json.dumps({
        "param": param,
        "results": [dict(row) for row in rows]
    }, indent=2)
```

### Step 3: Register Tool in `server.py`

```python
@mcp.tool(
    name="analysis_new_tool",
    annotations={
        "title": "New Tool Title",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def analysis_new_tool(params: NewToolInput) -> str:
    """Tool description for AI agents."""
    return await new_tool_query(param=params.param)
```

### Step 4: Export from `tools/__init__.py`

```python
from .analysis import new_tool_query
__all__ = [..., "new_tool_query"]
```

### Step 5: Test Locally, Then Deploy

See [Testing Methods](#testing-methods) above.

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL_PYTHON` | Infisical | PostgreSQL connection string |
| `MCP_PORT` | Infisical/default | HTTP port (default: 8085) |

## References

- [tools-reference.md](references/tools-reference.md) - Detailed tool documentation
