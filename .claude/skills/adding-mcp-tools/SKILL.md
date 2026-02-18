---
name: adding-mcp-tools
description: Use when adding new MCP tools to the analysis server, creating new MCP servers, or changing tool tier access levels
---

# Adding MCP Tools

## Overview

MCP tools use a `min_tier` annotation pattern for tier-based access control. Each tool in `_TOOL_REGISTRY` declares the lowest tier that can access it. Tiers are cumulative: `free < pro < max < dev` -- a higher tier always includes all lower-tier tools.

## Quick Reference

| Task                        | Files to modify                                                             |
| --------------------------- | --------------------------------------------------------------------------- |
| Add tool to existing server | `tools/<module>.py`, `tools/__init__.py`, `server.py` (`_TOOL_REGISTRY`)    |
| Change a tool's tier        | `server.py` -- one `min_tier` value                                         |
| Add new MCP server          | `mcp-manifest.json`, `docker-compose.yml`, new server code, rebuild gateway |

## Adding a Tool (Step-by-Step)

All paths relative to `services/mcp/`.

### 1. Write the tool function in `tools/analysis.py`

```python
async def get_momentum_signals(conn, symbol: str, days: int = 14) -> str:
    rows = await _safe_fetch(conn, "SELECT ...", symbol, days)
    return json.dumps([dict(r) for r in rows], default=str)
```

### 2. Export from `tools/__init__.py`

```python
from .analysis import get_momentum_signals
```

### 3. Add Pydantic input model and registration function in `server.py`

```python
class MomentumInput(BaseModel):
    symbol: str = Field(..., description="Stock ticker symbol", min_length=1, max_length=10)
    days: int = Field(default=14, description="Lookback period in days", ge=1, le=90)

def _register_get_momentum(app: FastMCP) -> None:
    @app.tool(
        name="analysis_get_momentum",
        annotations={"title": "Get Momentum Signals", **_RO_ANNOTATIONS},
    )
    async def analysis_get_momentum(params: MomentumInput, conn=Depends(get_db)) -> str:
        """Get momentum indicator signals for a stock."""
        return await get_momentum_signals(conn=conn, symbol=params.symbol, days=params.days)
```

### 4. Add to `_TOOL_REGISTRY` with `min_tier`

```python
_TOOL_REGISTRY: dict[str, ToolEntry] = {
    # ... existing tools ...
    "analysis_get_momentum": ToolEntry(fn=_register_get_momentum, min_tier="max"),
}
```

### 5. Deploy

Only the MCP server needs rebuilding. The gateway does NOT need rebuilding -- `cursor-agent` discovers new tools at runtime via `list_tools`.

## Tier Hierarchy

| min_tier | Accessible by       |
| -------- | ------------------- |
| `"free"` | free, pro, max, dev |
| `"pro"`  | pro, max, dev       |
| `"max"`  | max, dev            |
| `"dev"`  | dev only            |

## Common Mistakes

- **Missing `__init__.py` export** -- tool function won't be importable
- **Wrong `min_tier` value** -- `ToolEntry` validates at import time; typos crash the server with a clear error
- **Missing `analysis_` prefix** -- all tools in the analysis server use this naming convention
- **Missing `_RO_ANNOTATIONS`** -- read-only tools must declare `readOnlyHint=True`
- **No Pydantic model** -- all tool inputs must use a Pydantic `BaseModel` with `Field` descriptions
- **Rebuilding gateway unnecessarily** -- only needed when adding a NEW MCP server, not new tools

## Adding a New MCP Server

1. Add entry to `services/ai/gateway-2.0/mcp-manifest.json`
2. Run `npm run generate:tier-homes` in gateway directory, commit generated files
3. Add Docker service to `deployment/vm/docker-compose.yml`
4. Rebuild gateway (so `tier-homes/` mcp.json files are updated in the image)
