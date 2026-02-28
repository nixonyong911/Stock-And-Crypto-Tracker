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
from tools.indicators import get_technical_signals
from tools.fundamentals import get_fundamentals_trend, compare_stocks
from tools.economic import get_macro_environment
from tools.earnings import get_earnings_history, get_market_earnings
from tools.screener import screen_stocks
from tools.price_targets import get_price_targets


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


class TechnicalSignalsInput(BaseModel):
    """Input for technical indicator signals query."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL')", min_length=1, max_length=10)
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


class FundamentalsTrendInput(BaseModel):
    """Input for fundamentals trend query."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL')", min_length=1, max_length=10)
    quarters: int = Field(default=4, description="Number of quarters to analyze", ge=1, le=12)


class CompareStocksInput(BaseModel):
    """Input for peer comparison."""
    symbols: list[str] = Field(
        ...,
        description="List of 2-10 ticker symbols to compare (e.g., ['AAPL', 'MSFT', 'GOOGL'])",
        min_length=2,
        max_length=10,
    )

    @field_validator('symbols')
    @classmethod
    def validate_symbols(cls, v: list[str]) -> list[str]:
        cleaned = [s.strip().upper() for s in v if s.strip()]
        if len(cleaned) < 2:
            raise ValueError("At least 2 symbols required for comparison")
        return cleaned


class MacroEnvironmentInput(BaseModel):
    """Input for macro environment query."""
    category: Optional[str] = Field(
        None,
        description="Filter by category (e.g., 'inflation', 'employment', 'growth', 'interest_rates')",
    )


class EarningsHistoryInput(BaseModel):
    """Input for earnings history query."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL')", min_length=1, max_length=10)
    quarters: int = Field(default=4, description="Number of past quarters to show", ge=1, le=12)


class MarketEarningsInput(BaseModel):
    """Input for market-wide earnings query."""
    days_ahead: int = Field(default=7, description="Days ahead for upcoming earnings", ge=1, le=30)
    days_back: int = Field(default=14, description="Days back for recent surprises", ge=1, le=90)
    min_surprise_pct: Optional[float] = Field(
        None,
        description="Minimum abs(surprise %) to include — filters out trivial beats/misses",
        ge=0,
    )


class ScreenStocksInput(BaseModel):
    """Input for multi-signal stock screener."""
    rsi_above: Optional[float] = Field(None, description="RSI must be above this value", ge=0, le=100)
    rsi_below: Optional[float] = Field(None, description="RSI must be below this value", ge=0, le=100)
    macd_signal: Optional[str] = Field(None, description="MACD momentum: 'bullish' or 'bearish'")
    max_pe: Optional[float] = Field(None, description="Maximum P/E ratio")
    min_roe: Optional[float] = Field(None, description="Minimum Return on Equity (decimal, e.g., 0.15 = 15%)")
    min_revenue_growth: Optional[float] = Field(None, description="Minimum revenue growth YoY (decimal, e.g., 0.10 = 10%)")
    max_debt_to_equity: Optional[float] = Field(None, description="Maximum Debt-to-Equity ratio")
    min_operating_margin: Optional[float] = Field(None, description="Minimum operating margin (decimal)")
    min_fcf_yield: Optional[float] = Field(None, description="Minimum free cash flow yield (decimal)")
    max_peg_ratio: Optional[float] = Field(None, description="Maximum PEG ratio")
    pattern_signal: Optional[str] = Field(None, description="Candlestick pattern signal: 'bullish' or 'bearish'")
    earnings_within_days: Optional[int] = Field(None, description="Stocks with earnings within N days", ge=1, le=30)
    limit: int = Field(default=20, description="Maximum results to return", ge=1, le=50)
    sort_by: Optional[str] = Field(None, description="Sort by metric: 'pe_ratio', 'roe', 'revenue_growth_yoy', 'rsi', 'market_cap'")

    @field_validator('macd_signal', 'pattern_signal')
    @classmethod
    def validate_signal_enum(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("bullish", "bearish"):
            raise ValueError(f"Must be 'bullish' or 'bearish', got '{v}'")
        return v

    @field_validator('sort_by')
    @classmethod
    def validate_sort_by(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"pe_ratio", "roe", "revenue_growth_yoy", "rsi", "market_cap"}
        if v is not None and v not in allowed:
            raise ValueError(f"sort_by must be one of {allowed}, got '{v}'")
        return v


class PriceTargetsInput(BaseModel):
    """Input for price target analysis query."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL')", min_length=1, max_length=10)
    days: int = Field(default=1, description="Number of recent days to return", ge=1, le=30)


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


def _register_get_technical_signals(app: FastMCP) -> None:
    """Register analysis_get_technical_signals tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_technical_signals",
        annotations={"title": "Get Technical Signals", **_RO_ANNOTATIONS},
    )
    async def analysis_get_technical_signals(params: TechnicalSignalsInput, conn=Depends(get_db)) -> str:
        """
        Get daily technical indicators for a stock with built-in signal detection.

        Returns time-series SMA, EMA, MACD, RSI plus detected signals:
        - MACD bullish/bearish crossovers (histogram sign flip)
        - RSI overbought/oversold zone entries and exits
        - EMA/SMA crossovers (golden cross / death cross)
        - Current assessment: RSI zone, MACD momentum, trend direction

        Note: Indicator data has 90-day retention. Requests beyond that will be flagged.
        """
        return await get_technical_signals(
            conn=conn, symbol=params.symbol,
            start_date=params.start_date, end_date=params.end_date,
        )


def _register_get_fundamentals_trend(app: FastMCP) -> None:
    """Register analysis_get_fundamentals_trend tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_fundamentals_trend",
        annotations={"title": "Get Fundamentals Trend", **_RO_ANNOTATIONS},
    )
    async def analysis_get_fundamentals_trend(params: FundamentalsTrendInput, conn=Depends(get_db)) -> str:
        """
        Get quarter-over-quarter fundamentals trajectory for a stock.

        Returns for each quarter:
        - Valuation: P/E, Forward P/E, PEG, FCF yield, market cap
        - Growth: Revenue TTM, revenue growth YoY, EPS TTM, EPS growth YoY
        - Profitability: ROE, ROIC, operating margin
        - Health: Debt/equity, interest coverage, FCF, dividend yield
        - QoQ change: Computed deltas for key metrics vs prior quarter
        - Earnings surprise: EPS and revenue surprise % (integrated from earnings data)

        Trajectory summary: direction of revenue growth, EPS growth, margins,
        leverage (accelerating/decelerating/stable/mixed), plus earnings beat streak.
        """
        return await get_fundamentals_trend(
            conn=conn, symbol=params.symbol, quarters=params.quarters,
        )


def _register_compare_stocks(app: FastMCP) -> None:
    """Register analysis_compare_stocks tool on a FastMCP instance."""
    @app.tool(
        name="analysis_compare_stocks",
        annotations={"title": "Compare Stocks", **_RO_ANNOTATIONS},
    )
    async def analysis_compare_stocks(params: CompareStocksInput, conn=Depends(get_db)) -> str:
        """
        Side-by-side peer comparison of 2-10 stocks with per-metric ranking.

        Compares latest fundamentals (P/E, ROE, growth, margins, leverage)
        and current technical indicators (RSI, MACD).

        Each stock gets a rank per metric (1 = best). Includes best-in-class
        summary: cheapest P/E, highest profitability, best growth, best value.
        """
        return await compare_stocks(conn=conn, symbols=params.symbols)


def _register_get_macro_environment(app: FastMCP) -> None:
    """Register analysis_get_macro_environment tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_macro_environment",
        annotations={"title": "Get Macro Environment", **_RO_ANNOTATIONS},
    )
    async def analysis_get_macro_environment(params: MacroEnvironmentInput, conn=Depends(get_db)) -> str:
        """
        Get the current macro-economic environment assessment.

        Returns:
        - Regime classification: risk-on, risk-off, or mixed (based on signal counts)
        - All active economic indicators with value, trend, signal, and why (bullish_when)
        - Upcoming catalysts: economic data releases within 14 days with current signal context

        Optional category filter: inflation, employment, growth, interest_rates,
        yield_curve, sentiment, money_supply, credit.
        """
        return await get_macro_environment(conn=conn, category=params.category)


def _register_get_earnings_history(app: FastMCP) -> None:
    """Register analysis_get_earnings_history tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_earnings_history",
        annotations={"title": "Get Earnings History", **_RO_ANNOTATIONS},
    )
    async def analysis_get_earnings_history(params: EarningsHistoryInput, conn=Depends(get_db)) -> str:
        """
        Get earnings history for a stock with track record analysis.

        Returns:
        - Next upcoming earnings date with estimates
        - Historical quarters with EPS and revenue: estimates, actuals, surprise %
        - Track record: beat streak, beat/miss counts, average surprise %
          for both EPS and revenue

        A company with a 6-quarter beat streak and 3%+ average EPS surprise
        is very different from one that alternates beats and misses.
        """
        return await get_earnings_history(
            conn=conn, symbol=params.symbol, quarters=params.quarters,
        )


def _register_get_market_earnings(app: FastMCP) -> None:
    """Register analysis_get_market_earnings tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_market_earnings",
        annotations={"title": "Get Market Earnings", **_RO_ANNOTATIONS},
    )
    async def analysis_get_market_earnings(params: MarketEarningsInput, conn=Depends(get_db)) -> str:
        """
        Market-wide earnings dashboard: who's reporting soon and who recently surprised.

        Returns:
        - Upcoming: stocks reporting within days_ahead, with EPS/revenue estimates
        - Recent surprises: biggest beats and biggest misses within days_back,
          sorted by surprise magnitude (both EPS and revenue surprise %)

        Use min_surprise_pct to filter out trivial beats/misses.
        """
        return await get_market_earnings(
            conn=conn, days_ahead=params.days_ahead, days_back=params.days_back,
            min_surprise_pct=params.min_surprise_pct,
        )


def _register_screen_stocks(app: FastMCP) -> None:
    """Register analysis_screen_stocks tool on a FastMCP instance."""
    @app.tool(
        name="analysis_screen_stocks",
        annotations={"title": "Screen Stocks", **_RO_ANNOTATIONS},
    )
    async def analysis_screen_stocks(params: ScreenStocksInput, conn=Depends(get_db)) -> str:
        """
        Multi-signal cross-domain stock screener.

        Filter across technical indicators, fundamentals, candlestick patterns,
        and earnings schedule simultaneously. Only joins tables for active filters.

        At least one filter is required. Examples:
        - Oversold quality stocks: rsi_below=30, min_roe=0.15, max_debt_to_equity=1.0
        - Cheap growth stocks: max_pe=20, min_revenue_growth=0.15
        - Bullish momentum: macd_signal='bullish', pattern_signal='bullish'
        - Earnings plays: earnings_within_days=7, min_roe=0.10
        """
        return await screen_stocks(
            conn=conn,
            rsi_above=params.rsi_above, rsi_below=params.rsi_below,
            macd_signal=params.macd_signal,
            max_pe=params.max_pe, min_roe=params.min_roe,
            min_revenue_growth=params.min_revenue_growth,
            max_debt_to_equity=params.max_debt_to_equity,
            min_operating_margin=params.min_operating_margin,
            min_fcf_yield=params.min_fcf_yield,
            max_peg_ratio=params.max_peg_ratio,
            pattern_signal=params.pattern_signal,
            earnings_within_days=params.earnings_within_days,
            limit=params.limit, sort_by=params.sort_by,
        )


def _register_get_price_targets(app: FastMCP) -> None:
    """Register analysis_get_price_targets tool on a FastMCP instance."""
    @app.tool(
        name="analysis_get_price_targets",
        annotations={"title": "Get Price Targets", **_RO_ANNOTATIONS},
    )
    async def analysis_get_price_targets(params: PriceTargetsInput, conn=Depends(get_db)) -> str:
        """
        Get pre-computed price target analysis for a stock.

        Returns daily entry price, target price, stop loss, signal summary,
        confidence score, and calculation metadata. Covers the most recent N days
        (default 1, max 30).

        Use this to quickly see where a stock's computed support, entry, and
        upside target levels sit relative to its latest close.
        """
        return await get_price_targets(
            conn=conn, symbol=params.symbol, days=params.days,
        )


# Tool name -> ToolEntry with min_tier annotation.
# Tiers are cumulative: free < pro < max < dev.
# A tool with min_tier="pro" is available to pro, max, and dev users.
_TOOL_REGISTRY: dict[str, ToolEntry] = {
    # Candlestick pattern tools (existing)
    "analysis_get_stock":               ToolEntry(fn=_register_get_stock,               min_tier="free"),
    "analysis_get_statistics":           ToolEntry(fn=_register_get_statistics,           min_tier="free"),
    "analysis_list_patterns":            ToolEntry(fn=_register_list_patterns,            min_tier="pro"),
    "analysis_get_bullish":              ToolEntry(fn=_register_get_bullish,              min_tier="pro"),
    "analysis_get_bearish":              ToolEntry(fn=_register_get_bearish,              min_tier="pro"),
    # Technical indicators
    "analysis_get_technical_signals":    ToolEntry(fn=_register_get_technical_signals,    min_tier="free"),
    # Fundamentals
    "analysis_get_fundamentals_trend":   ToolEntry(fn=_register_get_fundamentals_trend,   min_tier="free"),
    "analysis_compare_stocks":           ToolEntry(fn=_register_compare_stocks,           min_tier="free"),
    # Macro environment
    "analysis_get_macro_environment":    ToolEntry(fn=_register_get_macro_environment,    min_tier="free"),
    # Earnings
    "analysis_get_earnings_history":     ToolEntry(fn=_register_get_earnings_history,     min_tier="free"),
    "analysis_get_market_earnings":      ToolEntry(fn=_register_get_market_earnings,      min_tier="free"),
    # Cross-domain screener
    "analysis_screen_stocks":            ToolEntry(fn=_register_screen_stocks,            min_tier="free"),
    # Price targets
    "analysis_get_price_targets":        ToolEntry(fn=_register_get_price_targets,        min_tier="free"),
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
