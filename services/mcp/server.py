#!/usr/bin/env python3
"""
MCP Analysis Server - Read-only Financial Data Queries

This server provides tools for AI agents to query candlestick pattern analysis
data from the Stock and Crypto Tracker database.

All operations are READ-ONLY (SELECT queries only).

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
# Lifespan Management with Graceful Shutdown
# ===========================================

@asynccontextmanager
async def app_lifespan(app):
    """
    Manage database pool lifecycle with graceful shutdown handling.
    
    Features:
    - Eager pool initialization on startup
    - Signal handlers for SIGTERM/SIGINT (docker stop, Ctrl+C)
    - Graceful connection pool closure with timeout
    - Proper resource cleanup on shutdown
    """
    print("=" * 50)
    print("MCP Analysis Server Starting Up")
    print("=" * 50)
    
    # Setup signal handlers for graceful shutdown
    setup_signal_handlers()
    print("Signal handlers registered (SIGTERM, SIGINT)")
    
    # Initialize database pool
    print("Initializing database connection pool...")
    await init_pool()
    print("Database pool initialized successfully")
    
    try:
        yield
    finally:
        print("=" * 50)
        print("MCP Analysis Server Shutting Down")
        print("=" * 50)
        
        # Close database pool with timeout
        print("Closing database connection pool...")
        await close_pool(timeout=10.0)
        
        print("Shutdown complete")


# ===========================================
# Initialize the MCP server with lifespan
# ===========================================

mcp = FastMCP("analysis_mcp", lifespan=app_lifespan)


# ===========================================
# Middleware Setup (order matters!)
# ===========================================

def setup_middleware():
    """Setup caching and rate limiting middleware."""
    try:
        from fastmcp.server.middleware.rate_limiting import SlidingWindowRateLimitingMiddleware
        from fastmcp.server.middleware.caching import (
            ResponseCachingMiddleware,
            CallToolSettings,
            ListToolsSettings,
        )
        from key_value.aio.stores.redis import RedisStore
        from key_value.aio.wrappers.prefix_collections import PrefixCollectionsWrapper

        # 1. Rate limiting first (reject excess requests early)
        mcp.add_middleware(SlidingWindowRateLimitingMiddleware(
            max_requests=100,
            window_minutes=1
        ))
        print(f"Rate limiting enabled: 100 requests/minute")

        # 2. Redis caching with namespacing
        redis_store = RedisStore(host=REDIS_HOST, port=REDIS_PORT)
        namespaced_store = PrefixCollectionsWrapper(
            key_value=redis_store,
            prefix="mcp-analysis"
        )

        mcp.add_middleware(ResponseCachingMiddleware(
            cache_storage=namespaced_store,
            call_tool_settings=CallToolSettings(
                ttl=86400,  # 24 hours in seconds (daily data)
            ),
            list_tools_settings=ListToolsSettings(
                ttl=3600,  # 1 hour for tool list (rarely changes)
            ),
        ))
        print(f"Redis caching enabled: {REDIS_HOST}:{REDIS_PORT} (TTL: 24h)")

    except ImportError as e:
        print(f"Warning: Middleware not available ({e}). Running without caching/rate limiting.")
    except Exception as e:
        print(f"Warning: Failed to setup middleware ({e}). Running without caching/rate limiting.")


# Setup middleware on module load
setup_middleware()


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
# MCP Tools
# ===========================================

@mcp.tool(
    name="analysis_get_stock",
    annotations={
        "title": "Get Stock Candlestick Analysis",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def analysis_get_stock(params: StockAnalysisInput, conn=Depends(get_db)) -> str:
    """
    Query candlestick analysis data for a specific stock symbol within a date range.
    
    Returns daily candlestick data including:
    - Open, High, Low, Close prices and Volume
    - Candle characteristics (body size, wicks, bullish/bearish)
    - Detected candlestick patterns with confidence scores
    
    Args:
        params: StockAnalysisInput with symbol, start_date, end_date
    
    Returns:
        JSON with analysis results for the stock
    """
    return await get_stock_analysis(
        conn=conn,
        symbol=params.symbol,
        start_date=params.start_date,
        end_date=params.end_date
    )


@mcp.tool(
    name="analysis_list_patterns",
    annotations={
        "title": "List Detected Patterns",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
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
    
    Args:
        params: PatternListInput with analysis_date and optional pattern_type
    
    Returns:
        JSON with list of stocks and their detected patterns
    """
    return await list_detected_patterns(
        conn=conn,
        analysis_date=params.analysis_date,
        pattern_type=params.pattern_type
    )


@mcp.tool(
    name="analysis_get_bullish",
    annotations={
        "title": "Get Bullish Stocks",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def analysis_get_bullish(params: DateInput, conn=Depends(get_db)) -> str:
    """
    Get all stocks showing bullish patterns for a specific date.
    
    Returns stocks where is_bullish=true, ordered by body size (strongest first).
    Includes any bullish reversal or strong bullish pattern signals.
    
    Args:
        params: DateInput with analysis_date
    
    Returns:
        JSON with bullish stocks and their patterns
    """
    return await get_bullish_stocks(conn=conn, analysis_date=params.analysis_date)


@mcp.tool(
    name="analysis_get_bearish",
    annotations={
        "title": "Get Bearish Stocks",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def analysis_get_bearish(params: DateInput, conn=Depends(get_db)) -> str:
    """
    Get all stocks showing bearish patterns for a specific date.
    
    Returns stocks where is_bullish=false, ordered by body size (strongest first).
    Includes any bearish reversal or strong bearish pattern signals.
    
    Args:
        params: DateInput with analysis_date
    
    Returns:
        JSON with bearish stocks and their patterns
    """
    return await get_bearish_stocks(conn=conn, analysis_date=params.analysis_date)


@mcp.tool(
    name="analysis_get_statistics",
    annotations={
        "title": "Get Pattern Statistics",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def analysis_get_statistics(params: StatisticsInput, conn=Depends(get_db)) -> str:
    """
    Get aggregate statistics for candlestick patterns over the last N days.
    
    Returns:
    - Overall bullish/bearish ratio
    - Most common patterns detected
    - Daily breakdown of market sentiment
    
    Args:
        params: StatisticsInput with days (1-90, default 7)
    
    Returns:
        JSON with pattern statistics and trends
    """
    return await get_pattern_statistics(conn=conn, days=params.days)


if __name__ == "__main__":
    if "--stdio" in sys.argv:
        # Run with stdio transport for local Cursor MCP testing
        mcp.run(transport="stdio")
    else:
        # Run MCP server with HTTP transport for Docker deployment
        mcp.run(transport="http", host="0.0.0.0", port=MCP_PORT)
