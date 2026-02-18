"""MCP Analysis Tools Package."""

from .analysis import (
    get_stock_analysis,
    list_detected_patterns,
    get_bullish_stocks,
    get_bearish_stocks,
    get_pattern_statistics,
)
from .indicators import get_technical_signals
from .fundamentals import get_fundamentals_trend, compare_stocks
from .economic import get_macro_environment
from .earnings import get_earnings_history, get_market_earnings
from .screener import screen_stocks

__all__ = [
    "get_stock_analysis",
    "list_detected_patterns",
    "get_bullish_stocks",
    "get_bearish_stocks",
    "get_pattern_statistics",
    "get_technical_signals",
    "get_fundamentals_trend",
    "compare_stocks",
    "get_macro_environment",
    "get_earnings_history",
    "get_market_earnings",
    "screen_stocks",
]
