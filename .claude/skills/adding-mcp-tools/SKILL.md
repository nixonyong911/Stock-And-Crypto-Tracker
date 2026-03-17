---
name: adding-mcp-tools
description: Use when adding new MCP tools to the analysis server, creating new MCP servers, or changing tool tier access levels
---

# Adding MCP Tools

## Overview

MCP tools use a `min_tier` annotation pattern for tier-based access control. Each tool in `_TOOL_REGISTRY` declares the lowest tier that can access it. Tiers are cumulative: `free < pro < max < dev` -- a higher tier always includes all lower-tier tools.

## Current Tool Registry (15 Tools)

### Analysis Tools (free tier)

| Tool | Module | Purpose |
|------|--------|---------|
| `analysis_ticker_overview` | `ticker_overview.py` | Full single-call analysis for one ticker |
| `analysis_technical_signals` | `indicators.py` | Indicator time series with signal detection |
| `analysis_price_targets` | `price_targets.py` | Entry/target/stop-loss levels |
| `analysis_market_scan` | `market_scan.py` | Market-wide sentiment and patterns |
| `analysis_screen` | `screener.py` | Multi-filter stock screener |
| `analysis_compare` | `fundamentals.py` | Peer comparison (2-10 stocks) |
| `analysis_macro` | `economic.py` | Macro-economic environment |
| `analysis_market_earnings` | `earnings.py` | Market-wide earnings dashboard |
| `analysis_earnings_history` | `earnings.py` | Per-ticker earnings track record |
| `analysis_news_sentiment` | `news.py` | News sentiment analysis |

### DB Admin Tools (dev tier only)

These replaced the Supabase MCP and run against the VM PostgreSQL. Only available on `/mcp/dev` and stdio mode (Cursor IDE).

| Tool | Module | Purpose |
|------|--------|---------|
| `analysis_execute_sql` | `db_admin.py` | Raw SQL execution (SELECT/INSERT/UPDATE/DELETE/DDL) |
| `analysis_list_tables` | `db_admin.py` | List tables with optional column details, PKs, FKs |
| `analysis_list_extensions` | `db_admin.py` | List installed PostgreSQL extensions |
| `analysis_apply_migration` | `db_admin.py` | Apply tracked DDL migration (records in `schema_migrations`) |
| `analysis_list_migrations` | `db_admin.py` | List applied schema migrations |

> **Supabase policy:** The mirror script (`deployment/vm/scripts/mirror-to-supabase.sh`) is the sole authorized Supabase connection. All services and MCP tools must use VM PostgreSQL.

## Quick Reference

| Task | Files to modify |
|------|-----------------|
| Add tool to existing server | `tools/<module>.py`, `tools/__init__.py`, `server.py` (`_TOOL_REGISTRY`) |
| Change a tool's tier | `server.py` -- one `min_tier` value |
| Update security filters | `gateway-2.0/src/core/filter/keyword-filter.ts` + `filter.ts` |
| Add new MCP server | `mcp-manifest.json`, `docker-compose.yml`, new server code, rebuild gateway |

## Adding a Tool (Step-by-Step)

All paths relative to `services/mcp/`.

### 1. Write the tool function in `tools/<module>.py`

```python
async def get_momentum_signals(conn, symbol: str, days: int = 14) -> str:
    rows = await _safe_fetch(conn, "SELECT ...", symbol, days)
    return json.dumps([dict(r) for r in rows], default=str)
```

### 2. Export from `tools/__init__.py`

```python
from .module import get_momentum_signals
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
    # ... existing 15 tools ...
    "analysis_get_momentum": ToolEntry(fn=_register_get_momentum, min_tier="free"),
}
```

### 5. Update security filters (if tool name should be blocked from user output)

Add the new tool name pattern to **both** filter files in `gateway-2.0/src/core/filter/`:
- `filter.ts` -- output filter (strips tool names from LLM responses)
- `keyword-filter.ts` -- input filter (blocks users probing for tool names)

### 6. Update agent-context skill

Add the tool to `gateway-2.0/agent-context/skills/mcp-candlestick-tools.md` so the LLM knows when and how to use it.

### 7. Deploy

Only the MCP server needs rebuilding. The gateway does NOT need rebuilding -- `cursor-agent` discovers new tools at runtime via `list_tools`. Exception: if you changed filter files, gateway also needs a rebuild.

## Tier Hierarchy

| min_tier | Accessible by |
|----------|---------------|
| `"free"` | free, pro, max, dev |
| `"pro"` | pro, max, dev |
| `"max"` | max, dev |
| `"dev"` | dev only |

## Common Mistakes

- **Missing `__init__.py` export** -- tool function won't be importable
- **Wrong `min_tier` value** -- `ToolEntry` validates at import time; typos crash the server with a clear error
- **Missing `analysis_` prefix** -- all tools in the analysis server use this naming convention
- **Missing `_RO_ANNOTATIONS`** -- read-only tools must declare `readOnlyHint=True`. Use `_RW_ANNOTATIONS` for write-capable tools (e.g., `execute_sql`, `apply_migration`)
- **No Pydantic model** -- all tool inputs must use a Pydantic `BaseModel` with `Field` descriptions
- **Forgetting security filters** -- new tool names must be added to both `filter.ts` and `keyword-filter.ts`
- **Forgetting agent-context** -- LLM won't know when/how to use the tool without updating the skill file
- **Rebuilding gateway unnecessarily** -- only needed when adding a NEW MCP server or changing filter files, not new tools

## Adding a New MCP Server

1. Add entry to `services/ai/gateway-2.0/mcp-manifest.json`
2. Run `npm run generate:tier-homes` in gateway directory, commit generated files
3. Add Docker service to `deployment/vm/docker-compose.yml`
4. Rebuild gateway (so `tier-homes/` mcp.json files are updated in the image)
