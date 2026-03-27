#!/usr/bin/env python3
"""
MCP Analysis Server - Read-only Financial Data Queries (Consolidated)

Per-tier endpoints with cumulative tool access (free < pro < max < dev):
  /mcp/free -> free-tier tools
  /mcp/pro  -> free + pro tools
  /mcp/max  -> free + pro + max tools
  /mcp/dev  -> all tools
  /mcp      -> all tools (backward compat, to be removed)

18 tools (10 free analysis + 3 pro analysis + 5 DB admin):
  Analysis (free tier):
   1. analysis_ticker_overview   - Full single-ticker analysis
   2. analysis_technical_signals - Indicator time series with signal detection
   3. analysis_price_targets     - Price target history (entry/target/stop-loss)
   4. analysis_market_scan       - Market-wide sentiment, movers, and patterns
   5. analysis_screen            - Multi-filter stock screener
   6. analysis_compare           - Peer comparison (2-10 stocks)
   7. analysis_macro             - Macro-economic environment
   8. analysis_market_earnings   - Upcoming + recent earnings market-wide
   9. analysis_earnings_history  - Per-ticker earnings track record
  10. analysis_news_sentiment    - News sentiment analysis
  Advanced Analysis (pro tier):
  11. analysis_advanced_signals  - Advanced indicator time series (Bollinger/ATR/Stochastic/ADX/OBV/Fib/Pivot/Ichimoku)
  12. analysis_advanced_custom   - Custom-parameter indicators (alt Fib lookback, pivot types, VWAP)
  13. analysis_confluence_score  - Composite signal scoring from basic + advanced
  DB Admin (dev tier only):
  14. analysis_execute_sql       - Raw SQL execution
  15. analysis_list_tables       - List tables with optional column details
  16. analysis_list_extensions   - List PostgreSQL extensions
  17. analysis_apply_migration   - Apply tracked schema migration
  18. analysis_list_migrations   - List applied migrations

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
    get_pool,
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
from tools.news import get_news_sentiment, get_news_headlines, get_unfiltered_news, get_process_news_trigger
from tools.advanced_indicators import get_advanced_signals, get_advanced_custom
from tools.confluence import get_confluence_score
from tools.db_admin import (
    execute_sql,
    list_tables,
    list_extensions,
    apply_migration,
    list_migrations,
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


class NewsSentimentInput(BaseModel):
    """Input for AI-filtered news sentiment analysis."""
    ticker: Optional[str] = Field(None, description="Ticker symbol to filter news by (e.g., 'AAPL', 'NVDA'). Matches against affected_tickers.", max_length=20)
    days_back: int = Field(default=7, description="Number of days to look back", ge=1, le=30)
    category: Optional[str] = Field(None, description="News category filter (AI-assigned category)")
    sentiment: Optional[str] = Field(None, description="Sentiment filter: 'bullish', 'bearish', 'neutral'")
    limit: int = Field(default=20, description="Maximum articles to return", ge=1, le=50)

    @field_validator('sentiment')
    @classmethod
    def validate_sentiment(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("bullish", "bearish", "neutral"):
            raise ValueError(f"sentiment must be 'bullish', 'bearish', or 'neutral', got '{v}'")
        return v


class NewsHeadlinesInput(BaseModel):
    """Input for AI-filtered news headlines."""
    days_back: int = Field(default=3, description="Number of days to look back", ge=1, le=30)
    category: Optional[str] = Field(None, description="Category filter (AI-assigned category)")
    limit: int = Field(default=20, description="Maximum articles to return", ge=1, le=50)


class UnfilteredNewsInput(BaseModel):
    """Input for raw unfiltered news (dev-only)."""
    source: Optional[str] = Field(None, description="Source API filter: 'marketaux' or 'gnews'. Omit for both.")
    days_back: int = Field(default=3, description="Number of days to look back", ge=1, le=30)
    category: Optional[str] = Field(None, description="Search category filter")
    limit: int = Field(default=30, description="Maximum articles to return", ge=1, le=50)

    @field_validator('source')
    @classmethod
    def validate_source(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("marketaux", "gnews"):
            raise ValueError(f"source must be 'marketaux' or 'gnews', got '{v}'")
        return v


class EarningsHistoryInput(BaseModel):
    """Input for per-ticker earnings history."""
    symbol: str = Field(..., description="Stock ticker symbol (e.g., 'AAPL')", min_length=1, max_length=10)
    quarters: int = Field(default=4, description="Number of past quarters to show", ge=1, le=12)


# ===========================================
# Advanced Indicator Input Models (pro tier)
# ===========================================

class AdvancedSignalsInput(BaseModel):
    """Input for advanced indicator time series (pro tier)."""
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


class AdvancedCustomInput(BaseModel):
    """Input for custom-parameter advanced indicators (pro tier)."""
    symbol: str = Field(..., description="Ticker symbol (e.g., 'AAPL' or 'BTC/USD')", min_length=1, max_length=20)
    indicators: list[str] = Field(
        default=["fibonacci", "pivot_points", "ichimoku"],
        description="Which indicators to return: fibonacci, pivot_points, ichimoku, vwap",
    )
    fib_lookback_days: int = Field(default=50, description="Fibonacci lookback period in days", ge=14, le=180)
    pivot_type: str = Field(default="standard", description="Pivot point type: standard, fibonacci, camarilla, woodie")

    @field_validator('indicators')
    @classmethod
    def validate_indicators(cls, v: list[str]) -> list[str]:
        valid = {"fibonacci", "pivot_points", "ichimoku", "vwap"}
        for ind in v:
            if ind not in valid:
                raise ValueError(f"Invalid indicator '{ind}'. Valid: {sorted(valid)}")
        return v

    @field_validator('pivot_type')
    @classmethod
    def validate_pivot_type(cls, v: str) -> str:
        if v not in ("standard", "fibonacci", "camarilla", "woodie"):
            raise ValueError(f"pivot_type must be standard, fibonacci, camarilla, or woodie, got '{v}'")
        return v


class ConfluenceScoreInput(BaseModel):
    """Input for signal confluence scoring (pro tier)."""
    symbol: str = Field(..., description="Ticker symbol (e.g., 'AAPL' or 'BTC/USD')", min_length=1, max_length=20)


# ===========================================
# DB Admin Input Models (dev tier)
# ===========================================

class ExecuteSqlInput(BaseModel):
    """Input for raw SQL execution."""
    query: str = Field(..., description="The SQL query to execute")


class ListTablesInput(BaseModel):
    """Input for listing database tables."""
    schemas: list[str] = Field(default=["public"], description="Schemas to list tables from")
    verbose: bool = Field(default=False, description="Include column details, primary keys, and foreign keys")


class ListExtensionsInput(BaseModel):
    """Input for listing PostgreSQL extensions."""
    pass


class ApplyMigrationInput(BaseModel):
    """Input for applying a database migration."""
    name: str = Field(..., description="Migration name in snake_case (e.g., 'add_users_email_index')")
    query: str = Field(..., description="The SQL DDL to apply")


class ListMigrationsInput(BaseModel):
    """Input for listing applied migrations."""
    pass


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


def _register_news_sentiment(app: FastMCP) -> None:
    @app.tool(
        name="analysis_news_sentiment",
        annotations={"title": "News Sentiment", **_RO_ANNOTATIONS},
    )
    async def analysis_news_sentiment(params: NewsSentimentInput, conn=Depends(get_db)) -> str:
        """
        AI-filtered news with sentiment analysis.

        Returns recent news articles that passed AI relevance filtering, with
        sentiment scores, affected tickers, key points, and market implications.
        Filter by ticker (matches affected_tickers array), category, or sentiment.
        Provides aggregate bullish/bearish/neutral summary for the period.
        """
        return await get_news_sentiment(
            conn=conn, ticker=params.ticker, days_back=params.days_back,
            category=params.category, sentiment=params.sentiment,
            limit=params.limit,
        )


def _register_news_headlines(app: FastMCP) -> None:
    @app.tool(
        name="analysis_news_headlines",
        annotations={"title": "News Headlines", **_RO_ANNOTATIONS},
    )
    async def analysis_news_headlines(params: NewsHeadlinesInput, conn=Depends(get_db)) -> str:
        """
        AI-filtered news headlines with category and impact level.

        Returns recent headlines that passed AI relevance filtering, including
        summary, category, impact level, sentiment, and key points.
        Use category to focus on a specific topic.
        """
        return await get_news_headlines(
            conn=conn, days_back=params.days_back,
            category=params.category,
            limit=params.limit,
        )


def _register_unfiltered_news(app: FastMCP) -> None:
    @app.tool(
        name="internal_unfiltered_news",
        annotations={"title": "Unfiltered News (Dev)", **_RO_ANNOTATIONS},
    )
    async def internal_unfiltered_news(params: UnfilteredNewsInput, conn=Depends(get_db)) -> str:
        """
        Dev-only: raw unfiltered news before AI processing.

        Returns articles from the unfiltered_news_combined view (MarketAux + GNews)
        exactly as ingested. Useful for inspecting what the AI filter receives
        and comparing against filtered output.
        """
        return await get_unfiltered_news(
            conn=conn, source=params.source, days_back=params.days_back,
            category=params.category, limit=params.limit,
        )


def _register_process_news_trigger(app: FastMCP) -> None:
    @app.tool(
        name="internal_process_news_trigger",
        annotations={"title": "Process News Trigger (Dev)", **_RO_ANNOTATIONS},
    )
    async def internal_process_news_trigger(conn=Depends(get_db)) -> str:
        """
        Dev-only: information on how to trigger the news processing pipeline.

        Returns instructions for invoking the AI gateway's /internal/process-news
        endpoint. This tool is informational only.
        """
        return await get_process_news_trigger(conn=conn)


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
# Advanced Indicator Tool Registration (pro tier)
# ===========================================

def _register_advanced_signals(app: FastMCP) -> None:
    @app.tool(
        name="analysis_advanced_signals",
        annotations={"title": "Advanced Technical Signals", **_RO_ANNOTATIONS},
    )
    async def analysis_advanced_signals(params: AdvancedSignalsInput, conn=Depends(get_db)) -> str:
        """
        Advanced technical indicator time series with signal detection (pro tier).

        Returns daily Bollinger Bands, ATR, Stochastic Oscillator, ADX, OBV,
        Fibonacci Retracement, Pivot Points, and Ichimoku Cloud values.
        Detects: Bollinger squeeze/breakout, Stochastic crossovers, ADX trend
        signals, Ichimoku TK cross and cloud breakouts, key level proximity.
        """
        return await get_advanced_signals(
            conn=conn, symbol=params.symbol,
            start_date=params.start_date, end_date=params.end_date,
        )


def _register_advanced_custom(app: FastMCP) -> None:
    @app.tool(
        name="analysis_advanced_custom",
        annotations={"title": "Custom Advanced Indicators", **_RO_ANNOTATIONS},
    )
    async def analysis_advanced_custom(params: AdvancedCustomInput, conn=Depends(get_db)) -> str:
        """
        Advanced indicators with custom parameters (pro tier).

        Supports non-default Fibonacci lookback periods (14-180 days),
        alternative Pivot Point types (standard, fibonacci, camarilla, woodie),
        Ichimoku Cloud, and session VWAP from intraday 15-min candles.
        Uses pre-computed defaults when standard params are requested,
        computes on-the-fly only for custom parameters.
        """
        return await get_advanced_custom(
            conn=conn, symbol=params.symbol,
            indicators=params.indicators,
            fib_lookback_days=params.fib_lookback_days,
            pivot_type=params.pivot_type,
        )


def _register_confluence(app: FastMCP) -> None:
    @app.tool(
        name="analysis_confluence_score",
        annotations={"title": "Signal Confluence Score", **_RO_ANNOTATIONS},
    )
    async def analysis_confluence_score(params: ConfluenceScoreInput, conn=Depends(get_db)) -> str:
        """
        Composite signal confluence scoring from basic and advanced indicators (pro tier).

        Reads from both basic indicators (SMA/EMA/MACD/RSI) and advanced indicators
        (Bollinger/ATR/Stochastic/ADX/OBV/Fibonacci/Pivot/Ichimoku). Scores 5
        categories (trend, momentum, volatility, volume, key_levels) 0-100 each
        with weighted overall score. Returns signal strength (strong_bullish to
        strong_bearish) and detects divergences between indicator groups.
        """
        return await get_confluence_score(conn=conn, symbol=params.symbol)


# ===========================================
# DB Admin Tool Registration (dev tier)
# ===========================================

_RW_ANNOTATIONS = {
    "readOnlyHint": False,
    "destructiveHint": True,
    "idempotentHint": False,
    "openWorldHint": False,
}


def _register_execute_sql(app: FastMCP) -> None:
    @app.tool(
        name="analysis_execute_sql",
        annotations={"title": "Execute SQL", **_RW_ANNOTATIONS},
    )
    async def analysis_execute_sql(params: ExecuteSqlInput, conn=Depends(get_db)) -> str:
        """
        Execute raw SQL against the VM PostgreSQL database.

        Supports SELECT, INSERT, UPDATE, DELETE, and DDL statements.
        For DDL operations (CREATE, ALTER, DROP), prefer apply_migration
        to keep a tracked migration history.
        """
        return await execute_sql(conn=conn, query=params.query)


def _register_list_tables(app: FastMCP) -> None:
    @app.tool(
        name="analysis_list_tables",
        annotations={"title": "List Tables", **_RO_ANNOTATIONS},
    )
    async def analysis_list_tables(params: ListTablesInput, conn=Depends(get_db)) -> str:
        """
        List all tables in the specified schemas.

        By default returns a compact summary (schema, table name, row estimate).
        Set verbose=true to include column details, primary keys, and foreign keys.
        """
        return await list_tables(
            conn=conn, schemas=params.schemas, verbose=params.verbose,
        )


def _register_list_extensions(app: FastMCP) -> None:
    @app.tool(
        name="analysis_list_extensions",
        annotations={"title": "List Extensions", **_RO_ANNOTATIONS},
    )
    async def analysis_list_extensions(params: ListExtensionsInput, conn=Depends(get_db)) -> str:
        """List all installed PostgreSQL extensions with version and schema."""
        return await list_extensions(conn=conn)


def _register_apply_migration(app: FastMCP) -> None:
    @app.tool(
        name="analysis_apply_migration",
        annotations={"title": "Apply Migration", **_RW_ANNOTATIONS},
    )
    async def analysis_apply_migration(params: ApplyMigrationInput, conn=Depends(get_db)) -> str:
        """
        Apply a named SQL migration to the database.

        Executes the DDL inside a transaction and records it in the
        schema_migrations table. Skips if a migration with the same
        name was already applied. Use this instead of execute_sql for
        schema changes to maintain migration history.
        """
        return await apply_migration(conn=conn, name=params.name, query=params.query)


def _register_list_migrations(app: FastMCP) -> None:
    @app.tool(
        name="analysis_list_migrations",
        annotations={"title": "List Migrations", **_RO_ANNOTATIONS},
    )
    async def analysis_list_migrations(params: ListMigrationsInput, conn=Depends(get_db)) -> str:
        """List all applied schema migrations with timestamps."""
        return await list_migrations(conn=conn)


# ===========================================
# Tool Registry (10 analysis + 5 DB admin)
# ===========================================

_TOOL_REGISTRY: dict[str, ToolEntry] = {
    # Analysis tools (free tier)
    "analysis_ticker_overview":   ToolEntry(fn=_register_ticker_overview,   min_tier="free"),
    "analysis_technical_signals": ToolEntry(fn=_register_technical_signals, min_tier="free"),
    "analysis_price_targets":     ToolEntry(fn=_register_price_targets,     min_tier="free"),
    "analysis_market_scan":       ToolEntry(fn=_register_market_scan,       min_tier="free"),
    "analysis_screen":            ToolEntry(fn=_register_screen,            min_tier="free"),
    "analysis_compare":           ToolEntry(fn=_register_compare,           min_tier="free"),
    "analysis_macro":             ToolEntry(fn=_register_macro,             min_tier="free"),
    "analysis_market_earnings":   ToolEntry(fn=_register_market_earnings,   min_tier="free"),
    "analysis_earnings_history":  ToolEntry(fn=_register_earnings_history,  min_tier="free"),
    "analysis_news_sentiment":    ToolEntry(fn=_register_news_sentiment,    min_tier="free"),
    "analysis_news_headlines":    ToolEntry(fn=_register_news_headlines,    min_tier="free"),
    # Advanced analysis tools (pro tier)
    "analysis_advanced_signals":  ToolEntry(fn=_register_advanced_signals,  min_tier="pro"),
    "analysis_advanced_custom":   ToolEntry(fn=_register_advanced_custom,   min_tier="pro"),
    "analysis_confluence_score":  ToolEntry(fn=_register_confluence,        min_tier="pro"),
    # Internal dev tools
    "internal_unfiltered_news":   ToolEntry(fn=_register_unfiltered_news,       min_tier="dev"),
    "internal_process_news_trigger": ToolEntry(fn=_register_process_news_trigger, min_tier="dev"),
    # DB admin tools (dev tier only)
    "analysis_execute_sql":       ToolEntry(fn=_register_execute_sql,       min_tier="dev"),
    "analysis_list_tables":       ToolEntry(fn=_register_list_tables,       min_tier="dev"),
    "analysis_list_extensions":   ToolEntry(fn=_register_list_extensions,   min_tier="dev"),
    "analysis_apply_migration":   ToolEntry(fn=_register_apply_migration,   min_tier="dev"),
    "analysis_list_migrations":   ToolEntry(fn=_register_list_migrations,   min_tier="dev"),
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

        print("Validating indicator column contracts...")
        try:
            from validation import validate_indicator_columns
            pool = await get_pool()
            col_results = await validate_indicator_columns(pool)
            failed_tables = [t for t, r in col_results.items() if r["status"] != "ok"]
            if failed_tables:
                print(f"WARNING: Column validation issues in {len(failed_tables)} tables: {failed_tables}")
            else:
                print(f"Column validation passed for {len(col_results)} tables")
        except Exception as e:
            print(f"WARNING: Column validation skipped due to error: {e}")

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
