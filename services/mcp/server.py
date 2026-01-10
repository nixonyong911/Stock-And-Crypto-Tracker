#!/usr/bin/env python3
"""
MCP Analysis Server - Read-only Financial Data Queries

This server provides tools for AI agents to query candlestick pattern analysis
data from the Stock and Crypto Tracker database.

All operations are READ-ONLY (SELECT queries only).
"""

import json
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from fastmcp import FastMCP

from config import get_pool, close_pool, MCP_PORT
from tools.analysis import (
    get_stock_analysis,
    list_detected_patterns,
    get_bullish_stocks,
    get_bearish_stocks,
    get_pattern_statistics,
)


# Initialize the MCP server
mcp = FastMCP("analysis_mcp")


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
async def analysis_get_stock(params: StockAnalysisInput) -> str:
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
async def analysis_list_patterns(params: PatternListInput) -> str:
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
async def analysis_get_bullish(params: DateInput) -> str:
    """
    Get all stocks showing bullish patterns for a specific date.
    
    Returns stocks where is_bullish=true, ordered by body size (strongest first).
    Includes any bullish reversal or strong bullish pattern signals.
    
    Args:
        params: DateInput with analysis_date
    
    Returns:
        JSON with bullish stocks and their patterns
    """
    return await get_bullish_stocks(analysis_date=params.analysis_date)


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
async def analysis_get_bearish(params: DateInput) -> str:
    """
    Get all stocks showing bearish patterns for a specific date.
    
    Returns stocks where is_bullish=false, ordered by body size (strongest first).
    Includes any bearish reversal or strong bearish pattern signals.
    
    Args:
        params: DateInput with analysis_date
    
    Returns:
        JSON with bearish stocks and their patterns
    """
    return await get_bearish_stocks(analysis_date=params.analysis_date)


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
async def analysis_get_statistics(params: StatisticsInput) -> str:
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
    return await get_pattern_statistics(days=params.days)


if __name__ == "__main__":
    import sys
    if "--stdio" in sys.argv:
        # Run with stdio transport for local Cursor MCP testing
        mcp.run(transport="stdio")
    else:
        # Run MCP server with HTTP transport for Docker deployment
        mcp.run(transport="http", host="0.0.0.0", port=MCP_PORT)
