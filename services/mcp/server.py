#!/usr/bin/env python3
"""
MCP Analysis Server - Read-only Financial Data Queries

Per-tier endpoints for tool access control:
  /mcp/free  -> 2 tools (analysis_get_stock, analysis_get_statistics)
  /mcp/pro   -> 5 tools (all analysis tools)
  /mcp       -> all tools (max/dev tiers, backward compatible)

cursor-agent does NOT support client-side tools.allow in mcp.json,
so tool visibility is controlled server-side via separate endpoints.

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
from datetime import date
from typing import Optional

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

TIER_TOOLS: dict[str, list[str]] = {
    "free": ["analysis_get_stock", "analysis_get_statistics"],
    "pro": [
        "analysis_get_stock",
        "analysis_get_statistics",
        "analysis_list_patterns",
        "analysis_get_bullish",
        "analysis_get_bearish",
    ],
    # max/dev: all tools (represented by allowed_tools=None)
}


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


# Tool name -> registration function
_TOOL_REGISTRY: dict[str, callable] = {
    "analysis_get_stock": _register_get_stock,
    "analysis_list_patterns": _register_list_patterns,
    "analysis_get_bullish": _register_get_bullish,
    "analysis_get_bearish": _register_get_bearish,
    "analysis_get_statistics": _register_get_statistics,
}


# ===========================================
# Factory: Per-tier FastMCP Instance
# ===========================================

def create_mcp_app(allowed_tools: list[str] | None = None) -> FastMCP:
    """
    Create a FastMCP instance with only the specified tools registered.

    Args:
        allowed_tools: Tool names to register. None = all tools.

    Returns:
        Configured FastMCP instance.
    """
    app = FastMCP("analysis_mcp")

    for name, register_fn in _TOOL_REGISTRY.items():
        if allowed_tools is None or name in allowed_tools:
            register_fn(app)

    return app


# ===========================================
# Middleware Setup
# ===========================================

def setup_middleware(app: FastMCP) -> None:
    """Setup caching and rate limiting middleware on a FastMCP instance."""
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
            prefix="mcp-analysis",
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

    Routes (order matters - most specific prefix first):
      /mcp/free -> free tier (2 tools)
      /mcp/pro  -> pro tier (5 tools)
      /mcp      -> full (max/dev, all tools, backward compatible)

    Uses SSE transport because cursor-agent CLI connects via SSE
    (mcp.json files specify "transport": "sse").
    """
    from contextlib import AsyncExitStack
    from starlette.applications import Starlette
    from starlette.routing import Mount

    # Create per-tier FastMCP instances
    mcp_free = create_mcp_app(TIER_TOOLS["free"])
    mcp_pro = create_mcp_app(TIER_TOOLS["pro"])
    mcp_full = create_mcp_app()  # all tools

    # Setup middleware on each instance
    for instance in (mcp_free, mcp_pro, mcp_full):
        setup_middleware(instance)

    print(f"Tier endpoints configured:")
    print(f"  /mcp/free -> {len(TIER_TOOLS['free'])} tools: {TIER_TOOLS['free']}")
    print(f"  /mcp/pro  -> {len(TIER_TOOLS['pro'])} tools: {TIER_TOOLS['pro']}")
    print(f"  /mcp      -> {len(_TOOL_REGISTRY)} tools (all)")

    # Create SSE transport ASGI sub-apps.
    # path="/" so Starlette Mount handles the prefix (e.g., /mcp/free).
    # SSE transport exposes GET / (SSE endpoint) and POST /messages.
    # The MCP SSE protocol uses scope['root_path'] to build the correct
    # message endpoint URL for the client, so mounted paths work correctly.
    free_sse = mcp_free.http_app(path="/", transport="sse")
    pro_sse = mcp_pro.http_app(path="/", transport="sse")
    full_sse = mcp_full.http_app(path="/", transport="sse")

    sse_apps = [free_sse, pro_sse, full_sse]

    @asynccontextmanager
    async def combined_lifespan(starlette_app):
        """
        Combine our DB pool lifecycle with each FastMCP SSE app's lifespan.

        Each SSE app's lifespan initialises the FastMCP server's internal
        state (e.g., _started event). The parent Starlette app does not
        propagate nested lifespans automatically, so we invoke them here.
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
                for sse_app in sse_apps:
                    await stack.enter_async_context(sse_app.lifespan(sse_app))
                yield
        finally:
            print("=" * 50)
            print("MCP Analysis Server Shutting Down")
            print("=" * 50)

            print("Closing database connection pool...")
            await close_pool(timeout=10.0)

            print("Shutdown complete")

    # Assemble Starlette app.
    # Route order: most specific first to avoid prefix conflicts.
    app = Starlette(
        lifespan=combined_lifespan,
        routes=[
            Mount("/mcp/free", app=free_sse),
            Mount("/mcp/pro", app=pro_sse),
            Mount("/mcp", app=full_sse),
        ],
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
