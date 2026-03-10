#!/usr/bin/env python3
"""
MCP Analysis Server - Read-only Financial Data Queries (Consolidated)

Per-tier endpoints with cumulative tool access (free < pro < max < dev):
  /mcp/free -> free-tier tools
  /mcp/pro  -> free + pro tools
  /mcp/max  -> free + pro + max tools
  /mcp/dev  -> all tools
  /mcp      -> all tools (backward compat, to be removed)

9 consolidated tools (down from 19):
  1. analysis_ticker_overview   - Full single-ticker analysis (candlestick + indicators + fundamentals + earnings + price targets)
  2. analysis_technical_signals - Detailed indicator time series with signal detection
  3. analysis_price_targets     - Price target history (entry/target/stop-loss)
  4. analysis_market_scan       - Market-wide sentiment, movers, and patterns
  5. analysis_screen            - Multi-filter stock screener
  6. analysis_compare           - Peer comparison (2-10 stocks)
  7. analysis_macro             - Macro-economic environment
  8. analysis_market_earnings   - Upcoming + recent earnings market-wide
  9. analysis_earnings_history  - Per-ticker earnings track record

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
from tools.ticker_overview import get_ticker_overview
from tools.indicators import get_technical_signals
from tools.price_targets import get_price_targets
from tools.market_scan import get_market_scan
from tools.screener import screen_stocks
from tools.fundamentals import compare_stocks
from tools.economic import get_macro_environment
from tools.earnings import get_earnings_history, get_market_earnings


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
# Pydantic Input Models (Consolidated)
# ===========================================

class TickerOverviewInput(BaseModel):
    """Input for unified ticker analysis."""
    symbol: str = Field(..., description="Ticker symbol (e.g., 'AAPL' for stock, 'BTC/USD' for crypto)", min_length=1, max_length=20)
    sections: Optional[list[str]] = Field(
        None,
        description="Sections to include (default: all applicable). Options: candlestick, technical, fundamentals, earnings, price_targets",
    )

    @field_validator('sections')
    @classmethod
    def validate_sections(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        valid = {"candlestick", "technical", "fundamentals", "earnings", "price_targets"}
        for s in v:
            if s not in valid:
                raise ValueError(f"Invalid section '{s}'. Valid: {sorted(valid)}")
        return v


class TechnicalSignalsInput(BaseModel):
    """Input for technical indicator time series."""
    symbol: str = Field(..., description="Ticker symbol (e.g., 'AAPL' or 'BTC/USD')", min_length=1, max_length=20)
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


class PriceTargetsInput(BaseModel):
    """Input for price target query."""
    symbol: str = Field(..., description="Ticker symbol (e.g., 'AAPL' or 'BTC/USD')", min_length=1, max_length=20)
    days: int = Field(default=1, description="Number of recent days to return", ge=1, le=30)


class MarketScanInput(BaseModel):
    """Input for market-wide scan."""
    asset_type: str = Field(default="all", description="Asset type: 'stock', 'crypto', or 'all'")
    direction: str = Field(default="all", description="Filter by direction: 'bullish', 'bearish', or 'all'")
    days: int = Field(default=1, description="Number of days to analyze", ge=1, le=90)
    pattern_type: Optional[str] = Field(None, description="Filter by pattern (e.g., 'doji', 'hammer', 'shooting_star')")

    @field_validator('asset_type')
    @classmethod
    def validate_asset_type(cls, v: str) -> str:
        if v not in ("stock", "crypto", "all"):
            raise ValueError(f"asset_type must be 'stock', 'crypto', or 'all', got '{v}'")
        return v

    @field_validator('direction')
    @classmethod
    def validate_direction(cls, v: str) -> str:
        if v not in ("bullish", "bearish", "all"):
            raise ValueError(f"direction must be 'bullish', 'bearish', or 'all', got '{v}'")
        return v


class ScreenInput(BaseModel):
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
    sort_by: Optional[str] = Field(None, description="Sort by: 'pe_ratio', 'roe', 'revenue_growth_yoy', 'rsi', 'market_cap'")

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


class CompareInput(BaseModel):
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


class MacroInput(BaseModel):
    """Input for macro environment query."""
    category: Optional[str] = Field(
        None,
        description="Filter by category: 'inflation', 'employment', 'growth', 'interest_rates', 'yield_curve', 'sentiment', 'money_supply', 'credit'",
    )


class MarketEarningsInput(BaseModel):
    """Input for market-wide earnings query."""
    days_ahead: int = Field(default=7, description="Days ahead for upcoming earnings", ge=1, le=30)
    days_back: int = Field(default=14, description="Days back for recent surprises", ge=1, le=90)
    min_surprise_pct: Optional[float] = Field(
        None,
        description="Minimum abs(surprise %) to include — filters out trivial beats/misses",
        ge=0,
    )


class EarningsHistoryInput(BaseModel):
    """Input for per-ticker earnings history."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL')", min_length=1, max_length=10)
    quarters: int = Field(default=4, description="Number of past quarters to show", ge=1, le=12)


# ===========================================
# Tool Registration Functions
# ===========================================

_RO_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


def _register_ticker_overview(app: FastMCP) -> None:
    @app.tool(
        name="analysis_ticker_overview",
        annotations={"title": "Ticker Overview", **_RO_ANNOTATIONS},
    )
    async def analysis_ticker_overview(params: TickerOverviewInput, conn=Depends(get_db)) -> str:
        """
        Comprehensive single-call analysis for one ticker (stock or crypto).

        Auto-detects asset type from symbol format (BTC/USD = crypto).
        Returns latest candlestick data with patterns, current technical indicators
        (SMA, EMA, MACD, RSI) with assessment, fundamentals snapshot, earnings
        track record, and price targets — all in one response.

        Use 'sections' to limit output when you only need specific data.
        Crypto tickers return candlestick, technical, and price_targets only.
        """
        return await get_ticker_overview(
            conn=conn, symbol=params.symbol, sections=params.sections,
        )


def _register_technical_signals(app: FastMCP) -> None:
    @app.tool(
        name="analysis_technical_signals",
        annotations={"title": "Technical Signals Time Series", **_RO_ANNOTATIONS},
    )
    async def analysis_technical_signals(params: TechnicalSignalsInput, conn=Depends(get_db)) -> str:
        """
        Detailed daily technical indicators over a date range with signal detection.

        Returns time-series SMA, EMA, MACD, RSI plus detected signals:
        MACD bullish/bearish crossovers, RSI overbought/oversold zone entries/exits,
        EMA/SMA crossovers. Works for both stocks and crypto (auto-detected).

        Use this when you need multi-day indicator history. For latest snapshot only,
        use analysis_ticker_overview instead. 90-day data retention.
        """
        return await get_technical_signals(
            conn=conn, symbol=params.symbol,
            start_date=params.start_date, end_date=params.end_date,
        )


def _register_price_targets(app: FastMCP) -> None:
    @app.tool(
        name="analysis_price_targets",
        annotations={"title": "Price Targets", **_RO_ANNOTATIONS},
    )
    async def analysis_price_targets(params: PriceTargetsInput, conn=Depends(get_db)) -> str:
        """
        Pre-computed entry price, target price, and stop-loss for a stock or crypto.

        Returns daily levels with signal summary and confidence score.
        Covers the most recent N days (default 1, max 30).
        Works for both stocks and crypto.
        """
        return await get_price_targets(
            conn=conn, symbol=params.symbol, days=params.days,
        )


def _register_market_scan(app: FastMCP) -> None:
    @app.tool(
        name="analysis_market_scan",
        annotations={"title": "Market Scan", **_RO_ANNOTATIONS},
    )
    async def analysis_market_scan(params: MarketScanInput, conn=Depends(get_db)) -> str:
        """
        Market-wide sentiment scan across stocks and/or crypto.

        Returns overall bullish/bearish ratio, top movers by body size,
        detected candlestick patterns, and daily sentiment breakdown.

        Filter by asset_type (stock/crypto/all), direction (bullish/bearish/all),
        time range (days), and specific pattern_type.
        """
        return await get_market_scan(
            conn=conn, asset_type=params.asset_type, direction=params.direction,
            days=params.days, pattern_type=params.pattern_type,
        )


def _register_screen(app: FastMCP) -> None:
    @app.tool(
        name="analysis_screen",
        annotations={"title": "Stock Screener", **_RO_ANNOTATIONS},
    )
    async def analysis_screen(params: ScreenInput, conn=Depends(get_db)) -> str:
        """
        Multi-signal cross-domain stock screener.

        Filter across technical indicators, fundamentals, candlestick patterns,
        and earnings schedule simultaneously. At least one filter required.

        Examples:
        - Oversold quality: rsi_below=30, min_roe=0.15, max_debt_to_equity=1.0
        - Cheap growth: max_pe=20, min_revenue_growth=0.15
        - Bullish momentum: macd_signal='bullish', pattern_signal='bullish'
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


def _register_compare(app: FastMCP) -> None:
    @app.tool(
        name="analysis_compare",
        annotations={"title": "Compare Stocks", **_RO_ANNOTATIONS},
    )
    async def analysis_compare(params: CompareInput, conn=Depends(get_db)) -> str:
        """
        Side-by-side peer comparison of 2-10 stocks with per-metric ranking.

        Compares latest fundamentals (P/E, ROE, growth, margins, leverage)
        and current technical indicators (RSI, MACD).
        Each stock gets a rank per metric (1 = best).
        """
        return await compare_stocks(conn=conn, symbols=params.symbols)


def _register_macro(app: FastMCP) -> None:
    @app.tool(
        name="analysis_macro",
        annotations={"title": "Macro Environment", **_RO_ANNOTATIONS},
    )
    async def analysis_macro(params: MacroInput, conn=Depends(get_db)) -> str:
        """
        Current macro-economic environment assessment.

        Returns regime classification (risk-on/risk-off/mixed), all active
        economic indicators with value, trend, signal, and upcoming catalysts
        (economic data releases within 14 days).
        """
        return await get_macro_environment(conn=conn, category=params.category)


def _register_market_earnings(app: FastMCP) -> None:
    @app.tool(
        name="analysis_market_earnings",
        annotations={"title": "Market Earnings", **_RO_ANNOTATIONS},
    )
    async def analysis_market_earnings(params: MarketEarningsInput, conn=Depends(get_db)) -> str:
        """
        Market-wide earnings dashboard: who's reporting soon and who recently surprised.

        Returns upcoming earnings within days_ahead and biggest beats/misses
        within days_back, sorted by surprise magnitude.
        """
        return await get_market_earnings(
            conn=conn, days_ahead=params.days_ahead, days_back=params.days_back,
            min_surprise_pct=params.min_surprise_pct,
        )


def _register_earnings_history(app: FastMCP) -> None:
    @app.tool(
        name="analysis_earnings_history",
        annotations={"title": "Earnings History", **_RO_ANNOTATIONS},
    )
    async def analysis_earnings_history(params: EarningsHistoryInput, conn=Depends(get_db)) -> str:
        """
        Earnings track record for a single stock: quarterly EPS and revenue
        estimates vs actuals, surprise percentages, and beat streak analysis.
        """
        return await get_earnings_history(
            conn=conn, symbol=params.symbol, quarters=params.quarters,
        )


# ===========================================
# Tool Registry (9 tools, all free tier)
# ===========================================

_TOOL_REGISTRY: dict[str, ToolEntry] = {
    "analysis_ticker_overview":   ToolEntry(fn=_register_ticker_overview,   min_tier="free"),
    "analysis_technical_signals": ToolEntry(fn=_register_technical_signals, min_tier="free"),
    "analysis_price_targets":     ToolEntry(fn=_register_price_targets,     min_tier="free"),
    "analysis_market_scan":       ToolEntry(fn=_register_market_scan,       min_tier="free"),
    "analysis_screen":            ToolEntry(fn=_register_screen,            min_tier="free"),
    "analysis_compare":           ToolEntry(fn=_register_compare,           min_tier="free"),
    "analysis_macro":             ToolEntry(fn=_register_macro,             min_tier="free"),
    "analysis_market_earnings":   ToolEntry(fn=_register_market_earnings,   min_tier="free"),
    "analysis_earnings_history":  ToolEntry(fn=_register_earnings_history,  min_tier="free"),
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
    """
    from contextlib import AsyncExitStack
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Mount, Route

    routes: list[Mount | Route] = []
    http_apps = []

    for tier in TIER_ORDER:
        mcp_app = create_mcp_app(tier)
        setup_middleware(mcp_app, cache_prefix=f"mcp-analysis-{tier}")
        http_app = mcp_app.http_app(path="/")
        tier_tools = _tools_for_tier(tier)
        print(f"  /mcp/{tier} -> {len(tier_tools)} tools: {tier_tools}")
        routes.append(Mount(f"/mcp/{tier}", app=http_app))
        http_apps.append(http_app)

    mcp_full = create_mcp_app()
    setup_middleware(mcp_full, cache_prefix="mcp-analysis-full")
    full_http = mcp_full.http_app(path="/")
    print(f"  /mcp      -> {len(_TOOL_REGISTRY)} tools (backward compat)")
    routes.append(Mount("/mcp", app=full_http))
    http_apps.append(full_http)

    async def health_tools(request: Request) -> JSONResponse:
        return JSONResponse({
            tier: _tools_for_tier(tier) for tier in TIER_ORDER
        })

    routes.insert(0, Route("/health/tools", health_tools))

    print(f"Tier endpoints configured ({len(TIER_ORDER)} tiers + backward compat)")

    @asynccontextmanager
    async def combined_lifespan(starlette_app):
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
        mcp_full = create_mcp_app()
        setup_middleware(mcp_full)
        mcp_full.run(transport="stdio")
    else:
        import uvicorn
        app = build_asgi_app()
        uvicorn.run(app, host="0.0.0.0", port=MCP_PORT)
