"""MCP Analysis Tools Package (10 free + 3 pro analysis + 5 DB admin tools)."""

from .ticker_overview import get_ticker_overview
from .indicators import get_technical_signals
from .price_targets import get_price_targets
from .market_scan import get_market_scan
from .screener import screen_stocks
from .fundamentals import compare_stocks
from .economic import get_macro_environment
from .earnings import get_earnings_history, get_market_earnings
from .advanced_indicators import get_advanced_signals, get_advanced_custom
from .confluence import get_confluence_score
from .analysis import _safe_fetch, QUERY_TIMEOUT
from .db_admin import (
    execute_sql,
    list_tables,
    list_extensions,
    apply_migration,
    list_migrations,
)

__all__ = [
    "get_ticker_overview",
    "get_technical_signals",
    "get_price_targets",
    "get_market_scan",
    "screen_stocks",
    "compare_stocks",
    "get_macro_environment",
    "get_earnings_history",
    "get_market_earnings",
    "get_advanced_signals",
    "get_advanced_custom",
    "get_confluence_score",
    "_safe_fetch",
    "QUERY_TIMEOUT",
    "execute_sql",
    "list_tables",
    "list_extensions",
    "apply_migration",
    "list_migrations",
]
