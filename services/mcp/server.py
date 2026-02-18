#!/usr/bin/env python3
"""
MCP Analysis Server - Read-only Financial Data Queries

Per-tier endpoints with cumulative tool access (free < pro < max < dev):
  /mcp/free -> free-tier tools
  /mcp/pro  -> free + pro tools
  /mcp/max  -> free + pro + max tools
  /mcp/dev  -> all tools
  /mcp      -> all tools (backward compat, to be removed)

cursor-agent does NOT support client-side tools.allow in mcp.json,
so tool visibility is controlled server-side via separate endpoints.

Each tool is annotated with a `min_tier` (the lowest tier that can access it).
Tiers are cumulative: a higher tier always includes all lower-tier tools.

Features:
- Redis caching with 24-hour TTL (daily data)
- Rate limiting (100 requests/minute)
- Connection pooling with eager initialization and health checks
- Retry logic for transient failures
- Graceful shutdown handling (SIGTERM/SIGINT)
- Connection leak prevention
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date
from typing import Callable, Optional

from pydantic import BaseModel, Field, field_validator

from fastmcp import FastMCP
from fastmcp.dependencies import Depends

from config import (
    init_pool,
    close_pool,
    get_db,
    setup_signal_handlers,
    get_shutdown_event,
    MCP_PORT,
    REDIS_HOST,
    REDIS_PORT,
)
from tools.analysis import (
    get_stock_analysis,
    list_detected_patterns,
    get_bullish_stocks,
    get_bearish_stocks,
    get_pattern_statistics,
)


# ===========================================
# Tier Configuration
# ===========================================

TIER_ORDER = ["free", "pro", "max", "dev"]


@dataclass(frozen=True)
class ToolEntry:
    """Registry entry for an MCP tool with tier-based access control."""
    fn: Callable[[FastMCP], None]
    min_tier: str

    def __post_init__(self):
        if self.min_tier not in TIER_ORDER:
            raise ValueError(
                f"Invalid min_tier='{self.min_tier}'. Valid: {TIER_ORDER}"
            )


def _tier_includes(user_tier: str, min_tier: str) -> bool:
    """Check if a user's tier grants access to a tool with the given min_tier."""
    return TIER_ORDER.index(user_tier) >= TIER_ORDER.index(min_tier)


# ===========================================
# Pydantic Input Models
# ===========================================

class StockAnalysisInput(BaseModel):
    """Input for stock analysis query."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL', 'MSFT')", min_length=1, max_length=10)
    start_date: str = Field(..., description="Start date in YYYY-MM-DD format")
    end_date: str = Field(..., description="End date in YYYY-MM-DD format")

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD")


class PatternListInput(BaseModel):
    """Input for pattern listing."""
    analysis_date: str = Field(..., description="Date in YYYY-MM-DD format")
    pattern_type: Optional[str] = Field(None, description="Filter by pattern type (e.g., 'doji', 'hammer', 'marubozu_bullish')")

    @field_validator('analysis_date')
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD")


class DateInput(BaseModel):
    """Input for date-based queries."""
    analysis_date: str = Field(..., description="Date in YYYY-MM-DD format")

    @field_validator('analysis_date')
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD")


class StatisticsInput(BaseModel):
    """Input for statistics query."""
    days: int = Field(default=7, description="Number of days to analyze", ge=1, le=90)


# ===========================================
# Tool Registration Functions
# ===========================================

_RO_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


def _register_get_stock(app: FastMCP) -> None:
    """Register analysis_get_stock tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_stock",
        annotations={"title": "Get Stock Candlestick Analysis", **_RO_ANNOTATIONS},
    )
    async def analysis_get_stock(params: StockAnalysisInput, conn=Depends(get_db)) -> str:
        """
        Query candlestick analysis data for a specific stock symbol within a date range.

        Returns daily candlestick data including:
        - Open, High, Low, Close prices and Volume
        - Candle characteristics (body size, wicks, bullish/bearish)
        - Detected candlestick patterns with confidence scores
        """
        return await get_stock_analysis(
            conn=conn, symbol=params.symbol,
            start_date=params.start_date, end_date=params.end_date,
        )


def _register_list_patterns(app: FastMCP) -> None:
    """Register analysis_list_patterns tool on a FastMCP instance."""
    @app.tool(
        name="analysis_list_patterns",
        annotations={"title": "List Detected Patterns", **_RO_ANNOTATIONS},
    )
    async def analysis_list_patterns(params: PatternListInput, conn=Depends(get_db)) -> str:
        """
        List all detected candlestick patterns for a specific date.

        Optionally filter by pattern type. Supported patterns:
        - doji, long_legged_doji
        - hammer, inverted_hammer
        - shooting_star
        - marubozu_bullish, marubozu_bearish
        - spinning_top
        """
        return await list_detected_patterns(
            conn=conn, analysis_date=params.analysis_date,
            pattern_type=params.pattern_type,
        )


def _register_get_bullish(app: FastMCP) -> None:
    """Register analysis_get_bullish tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_bullish",
        annotations={"title": "Get Bullish Stocks", **_RO_ANNOTATIONS},
    )
    async def analysis_get_bullish(params: DateInput, conn=Depends(get_db)) -> str:
        """
        Get all stocks showing bullish patterns for a specific date, ordered by strength.

        Returns stocks where is_bullish=true, ordered by body size (strongest first).
        Includes any bullish reversal or strong bullish pattern signals.
        """
        return await get_bullish_stocks(conn=conn, analysis_date=params.analysis_date)


def _register_get_bearish(app: FastMCP) -> None:
    """Register analysis_get_bearish tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_bearish",
        annotations={"title": "Get Bearish Stocks", **_RO_ANNOTATIONS},
    )
    async def analysis_get_bearish(params: DateInput, conn=Depends(get_db)) -> str:
        """
        Get all stocks showing bearish patterns for a specific date, ordered by strength.

        Returns stocks where is_bullish=false, ordered by body size (strongest first).
        Includes any bearish reversal or strong bearish pattern signals.
        """
        return await get_bearish_stocks(conn=conn, analysis_date=params.analysis_date)


def _register_get_statistics(app: FastMCP) -> None:
    """Register analysis_get_statistics tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_statistics",
        annotations={"title": "Get Pattern Statistics", **_RO_ANNOTATIONS},
    )
    async def analysis_get_statistics(params: StatisticsInput, conn=Depends(get_db)) -> str:
        """
        Get aggregate statistics for candlestick patterns over the last N days (1-90).

        Returns:
        - Overall bullish/bearish ratio
        - Most common patterns detected
        - Daily breakdown of market sentiment
        """
        return await get_pattern_statistics(conn=conn, days=params.days)


# Tool name -> ToolEntry with min_tier annotation.
# Tiers are cumulative: free < pro < max < dev.
# A tool with min_tier="pro" is available to pro, max, and dev users.
_TOOL_REGISTRY: dict[str, ToolEntry] = {
    "analysis_get_stock":      ToolEntry(fn=_register_get_stock,      min_tier="free"),
    "analysis_get_statistics":  ToolEntry(fn=_register_get_statistics,  min_tier="free"),
    "analysis_list_patterns":   ToolEntry(fn=_register_list_patterns,   min_tier="pro"),
    "analysis_get_bullish":     ToolEntry(fn=_register_get_bullish,     min_tier="pro"),
    "analysis_get_bearish":     ToolEntry(fn=_register_get_bearish,     min_tier="pro"),
}


def _tools_for_tier(tier: str) -> list[str]:
    """Return tool names accessible at the given tier (cumulative)."""
    return [
        name for name, entry in _TOOL_REGISTRY.items()
        if _tier_includes(tier, entry.min_tier)
    ]


# ===========================================
# Factory: Per-tier FastMCP Instance
# ===========================================

def create_mcp_app(tier: str | None = None) -> FastMCP:
    """
    Create a FastMCP instance with tools filtered by tier.

    Args:
        tier: User tier (free/pro/max/dev). None = all tools (no filtering).

    Returns:
        Configured FastMCP instance.
    """
    app = FastMCP("analysis_mcp")

    for name, entry in _TOOL_REGISTRY.items():
        if tier is None or _tier_includes(tier, entry.min_tier):
            entry.fn(app)

    return app


# ===========================================
# Middleware Setup
# ===========================================

def setup_middleware(app: FastMCP, cache_prefix: str = "mcp-analysis") -> None:
    """Setup caching and rate limiting middleware on a FastMCP instance.

    Args:
        app: FastMCP instance to add middleware to.
        cache_prefix: Redis key prefix for this instance's cache.
            Must be unique per tier to avoid cross-tier cache pollution.
    """
    try:
        from fastmcp.server.middleware.rate_limiting import SlidingWindowRateLimitingMiddleware
        from fastmcp.server.middleware.caching import (
            ResponseCachingMiddleware,
            CallToolSettings,
            ListToolsSettings,
        )
        from key_value.aio.stores.redis import RedisStore
        from key_value.aio.wrappers.prefix_collections import PrefixCollectionsWrapper

        app.add_middleware(SlidingWindowRateLimitingMiddleware(
            max_requests=100,
            window_minutes=1,
        ))

        redis_store = RedisStore(host=REDIS_HOST, port=REDIS_PORT)
        namespaced_store = PrefixCollectionsWrapper(
            key_value=redis_store,
            prefix=cache_prefix,
        )

        app.add_middleware(ResponseCachingMiddleware(
            cache_storage=namespaced_store,
            call_tool_settings=CallToolSettings(ttl=86400),
            list_tools_settings=ListToolsSettings(ttl=3600),
        ))

    except ImportError as e:
        print(f"Warning: Middleware not available ({e}). Running without caching/rate limiting.")
    except Exception as e:
        print(f"Warning: Failed to setup middleware ({e}). Running without caching/rate limiting.")


# ===========================================
# ASGI Application Builder
# ===========================================

def build_asgi_app():
    """
    Build the Starlette ASGI app with per-tier MCP endpoints.

    Routes (most specific prefix first):
      /mcp/free -> free-tier tools
      /mcp/pro  -> free + pro tools
      /mcp/max  -> free + pro + max tools
      /mcp/dev  -> all tools
      /mcp      -> all tools (backward compat, remove after next release)
      /health/tools -> diagnostic JSON of tier-to-tool mapping

    Uses streamable HTTP transport (cursor-agent CLI always uses
    streamable HTTP regardless of mcp.json "transport" setting).
    """
    from contextlib import AsyncExitStack
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Mount, Route

    routes: list[Mount | Route] = []
    http_apps = []

    # Create per-tier FastMCP instances with middleware
    for tier in TIER_ORDER:
        mcp_app = create_mcp_app(tier)
        setup_middleware(mcp_app, cache_prefix=f"mcp-analysis-{tier}")
        http_app = mcp_app.http_app(path="/")
        tier_tools = _tools_for_tier(tier)
        print(f"  /mcp/{tier} -> {len(tier_tools)} tools: {tier_tools}")
        routes.append(Mount(f"/mcp/{tier}", app=http_app))
        http_apps.append(http_app)

    # Backward compat: /mcp -> all tools (same as dev).
    # TODO: Remove after confirming no clients use this path.
    mcp_full = create_mcp_app()
    setup_middleware(mcp_full, cache_prefix="mcp-analysis-full")
    full_http = mcp_full.http_app(path="/")
    print(f"  /mcp      -> {len(_TOOL_REGISTRY)} tools (backward compat)")
    routes.append(Mount("/mcp", app=full_http))
    http_apps.append(full_http)

    # Diagnostic endpoint: tier-to-tool mapping (internal, no auth)
    async def health_tools(request: Request) -> JSONResponse:
        return JSONResponse({
            tier: _tools_for_tier(tier) for tier in TIER_ORDER
        })

    routes.insert(0, Route("/health/tools", health_tools))

    print(f"Tier endpoints configured ({len(TIER_ORDER)} tiers + backward compat)")

    @asynccontextmanager
    async def combined_lifespan(starlette_app):
        """
        Combine our DB pool lifecycle with each FastMCP HTTP app's lifespan.

        Each http_app's lifespan initialises the StreamableHTTPSessionManager's
        task group. The parent Starlette app does not propagate nested lifespans
        automatically, so we invoke them here explicitly.
        See: https://gofastmcp.com/v2/deployment/http#mounting-in-starlette
        """
        print("=" * 50)
        print("MCP Analysis Server Starting Up")
        print("=" * 50)

        setup_signal_handlers()
        print("Signal handlers registered (SIGTERM, SIGINT)")

        print("Initializing database connection pool...")
        await init_pool()
        print("Database pool initialized successfully")

        try:
            async with AsyncExitStack() as stack:
                for http_app in http_apps:
                    await stack.enter_async_context(http_app.lifespan(http_app))
                yield
        finally:
            print("=" * 50)
            print("MCP Analysis Server Shutting Down")
            print("=" * 50)

            print("Closing database connection pool...")
            await close_pool(timeout=10.0)

            print("Shutdown complete")

    app = Starlette(
        lifespan=combined_lifespan,
        routes=routes,
    )

    return app


# ===========================================
# Entry Point
# ===========================================

if __name__ == "__main__":
    if "--stdio" in sys.argv:
        # Stdio transport: full tool set for local Cursor MCP testing
        mcp_full = create_mcp_app()
        setup_middleware(mcp_full)
        mcp_full.run(transport="stdio")
    else:
        import uvicorn
        app = build_asgi_app()
        uvicorn.run(app, host="0.0.0.0", port=MCP_PORT)
