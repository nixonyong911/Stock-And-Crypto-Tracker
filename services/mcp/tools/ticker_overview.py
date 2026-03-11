"""Unified ticker overview: candlestick + indicators + fundamentals + earnings + price targets."""

import asyncio
import json
from datetime import date, timedelta

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


def _is_crypto(symbol: str) -> bool:
    return "/" in symbol


ALL_SECTIONS = {"candlestick", "technical", "fundamentals", "earnings", "price_targets"}
CRYPTO_SECTIONS = {"candlestick", "technical", "price_targets"}


async def get_ticker_overview(
    conn,
    symbol: str,
    sections: list[str] | None = None,
) -> str:
    """
    Comprehensive single-call analysis for one ticker.

    Auto-detects stock vs crypto by symbol format (BTC/USD = crypto).
    Returns latest candlestick data, technical indicators, fundamentals,
    earnings, and price targets in one response.

    Args:
        conn: Database connection
        symbol: Ticker symbol (e.g., 'AAPL' for stock, 'BTC/USD' for crypto)
        sections: Optional list of sections to include. Defaults to all applicable.
                  Options: candlestick, technical, fundamentals, earnings, price_targets

    Returns:
        JSON with requested analysis sections
    """
    is_crypto = _is_crypto(symbol)
    available = CRYPTO_SECTIONS if is_crypto else ALL_SECTIONS

    if sections:
        requested = set(sections) & available
    else:
        requested = available

    if not requested:
        return json.dumps({
            "symbol": symbol.upper(),
            "asset_type": "crypto" if is_crypto else "stock",
            "message": "No valid sections requested",
            "available_sections": sorted(available),
        })

    result: dict = {
        "symbol": symbol.upper(),
        "asset_type": "crypto" if is_crypto else "stock",
    }

    try:
        if "candlestick" in requested:
            result["candlestick"] = await _fetch_candlestick(conn, symbol, is_crypto)

        if "technical" in requested:
            result["technical"] = await _fetch_technical(conn, symbol, is_crypto)

        if "fundamentals" in requested:
            result["fundamentals"] = await _fetch_fundamentals(conn, symbol)

        if "earnings" in requested:
            result["earnings"] = await _fetch_earnings(conn, symbol)

        if "price_targets" in requested:
            result["price_targets"] = await _fetch_price_targets(conn, symbol)

    except asyncio.TimeoutError:
        result["error"] = f"Query timeout (>{QUERY_TIMEOUT}s)"

    return json.dumps(result)


async def _fetch_candlestick(conn, symbol: str, is_crypto: bool) -> dict:
    if is_crypto:
        query = """
            SELECT
                ct.symbol,
                a.analysis_date,
                a.daily_open, a.daily_high, a.daily_low, a.daily_close, a.daily_volume,
                a.body_size, a.range_size, a.upper_wick, a.lower_wick,
                a.is_bullish, a.detected_patterns
            FROM analysis_crypto_candlestick_pattern a
            JOIN crypto_tickers ct ON a.crypto_ticker_id = ct.id
            WHERE UPPER(ct.symbol) = UPPER($1)
            ORDER BY a.analysis_date DESC
            LIMIT 5
        """
    else:
        query = """
            SELECT
                st.symbol,
                a.analysis_date,
                a.daily_open, a.daily_high, a.daily_low, a.daily_close, a.daily_volume,
                a.body_size, a.range_size, a.upper_wick, a.lower_wick,
                a.is_bullish, a.detected_patterns
            FROM analysis_stock_candlestick_pattern a
            JOIN stock_tickers st ON a.stock_ticker_id = st.id
            WHERE UPPER(st.symbol) = UPPER($1)
            ORDER BY a.analysis_date DESC
            LIMIT 5
        """

    rows = await _safe_fetch(conn, query, symbol)
    if not rows:
        return {"message": "No candlestick data"}

    latest = rows[0]
    patterns = json.loads(latest["detected_patterns"]) if latest["detected_patterns"] else []

    bullish_days = sum(1 for r in rows if r["is_bullish"])
    bearish_days = len(rows) - bullish_days

    return {
        "latest": {
            "date": str(latest["analysis_date"]),
            "open": _float(latest["daily_open"]),
            "high": _float(latest["daily_high"]),
            "low": _float(latest["daily_low"]),
            "close": _float(latest["daily_close"]),
            "volume": _float(latest["daily_volume"]),
            "is_bullish": latest["is_bullish"],
        },
        "patterns": patterns,
        "recent_sentiment": {
            "days": len(rows),
            "bullish_days": bullish_days,
            "bearish_days": bearish_days,
        },
    }


async def _fetch_technical(conn, symbol: str, is_crypto: bool) -> dict:
    if is_crypto:
        query = """
            SELECT i.sma, i.ema, i.macd_value, i.macd_signal, i.macd_histogram, i.rsi,
                   i.indicator_time
            FROM analysis_crypto_indicator i
            JOIN crypto_tickers ct ON i.crypto_ticker_id = ct.id
            WHERE UPPER(ct.symbol) = UPPER($1)
            ORDER BY i.indicator_time DESC
            LIMIT 1
        """
    else:
        query = """
            SELECT i.sma, i.ema, i.macd_value, i.macd_signal, i.macd_histogram, i.rsi,
                   i.indicator_time
            FROM analysis_stock_indicator i
            JOIN stock_tickers st ON i.stock_ticker_id = st.id
            WHERE UPPER(st.symbol) = UPPER($1)
            ORDER BY i.indicator_time DESC
            LIMIT 1
        """

    rows = await _safe_fetch(conn, query, symbol)
    if not rows:
        return {"message": "No indicator data"}

    row = rows[0]
    rsi = _float(row["rsi"])
    macd_hist = _float(row["macd_histogram"])
    ema = _float(row["ema"])
    sma = _float(row["sma"])

    rsi_zone = "neutral"
    if rsi is not None:
        if rsi >= 70:
            rsi_zone = "overbought"
        elif rsi <= 30:
            rsi_zone = "oversold"

    macd_momentum = "neutral"
    if macd_hist is not None:
        macd_momentum = "bullish" if macd_hist > 0 else "bearish"

    trend = "neutral"
    if ema is not None and sma is not None:
        trend = "ema_above_sma" if ema > sma else "ema_below_sma"

    return {
        "as_of": str(row["indicator_time"]),
        "sma_20": sma,
        "ema_20": ema,
        "rsi": rsi,
        "macd": {
            "value": _float(row["macd_value"]),
            "signal": _float(row["macd_signal"]),
            "histogram": macd_hist,
        },
        "assessment": {
            "rsi_zone": rsi_zone,
            "macd_momentum": macd_momentum,
            "trend": trend,
        },
    }


async def _fetch_fundamentals(conn, symbol: str) -> dict:
    query = """
        SELECT
            f.fiscal_year, f.fiscal_quarter,
            f.market_cap, f.pe_ratio, f.forward_pe, f.peg_ratio, f.fcf_yield,
            f.roe, f.roic, f.operating_margin,
            f.revenue_ttm, f.revenue_growth_yoy,
            f.eps_ttm, f.eps_growth_yoy,
            f.debt_to_equity, f.interest_coverage, f.beta,
            f.free_cash_flow, f.dividend_yield, f.dividend_per_share
        FROM analysis_stock_fundamentals f
        JOIN stock_tickers st ON f.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
        ORDER BY f.fiscal_year DESC, f.fiscal_quarter DESC
        LIMIT 1
    """

    rows = await _safe_fetch(conn, query, symbol)
    if not rows:
        return {"message": "No fundamental data"}

    row = rows[0]
    return {
        "period": f"Q{row['fiscal_quarter']} {row['fiscal_year']}",
        "valuation": {
            "pe_ratio": _float(row["pe_ratio"]),
            "forward_pe": _float(row["forward_pe"]),
            "peg_ratio": _float(row["peg_ratio"]),
            "fcf_yield": _float(row["fcf_yield"]),
            "market_cap": _float(row["market_cap"]),
        },
        "growth": {
            "revenue_growth_yoy": _float(row["revenue_growth_yoy"]),
            "eps_growth_yoy": _float(row["eps_growth_yoy"]),
        },
        "profitability": {
            "roe": _float(row["roe"]),
            "roic": _float(row["roic"]),
            "operating_margin": _float(row["operating_margin"]),
        },
        "health": {
            "debt_to_equity": _float(row["debt_to_equity"]),
            "interest_coverage": _float(row["interest_coverage"]),
            "beta": _float(row["beta"]),
            "dividend_yield": _float(row["dividend_yield"]),
            "dividend_per_share": _float(row["dividend_per_share"]),
        },
    }


async def _fetch_earnings(conn, symbol: str) -> dict:
    upcoming_query = """
        SELECT e.earnings_date, e.fiscal_year, e.fiscal_quarter,
               e.eps_estimate, e.revenue_estimate
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
          AND e.earnings_date >= CURRENT_DATE
          AND e.eps_actual IS NULL
        ORDER BY e.earnings_date ASC
        LIMIT 1
    """

    history_query = """
        SELECT e.fiscal_year, e.fiscal_quarter, e.earnings_date,
               e.eps_estimate, e.eps_actual, e.eps_surprise_percent
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
          AND e.eps_actual IS NOT NULL
        ORDER BY e.fiscal_year DESC, e.fiscal_quarter DESC
        LIMIT 4
    """

    upcoming_rows = await _safe_fetch(conn, upcoming_query, symbol)
    hist_rows = await _safe_fetch(conn, history_query, symbol)

    if not upcoming_rows and not hist_rows:
        return {"message": "No earnings data"}

    next_earnings = None
    if upcoming_rows:
        ur = upcoming_rows[0]
        next_earnings = {
            "date": str(ur["earnings_date"]) if ur["earnings_date"] else None,
            "period": f"Q{ur['fiscal_quarter']} {ur['fiscal_year']}",
            "eps_estimate": _float(ur["eps_estimate"]),
        }

    beat_streak = 0
    for row in hist_rows:
        surprise = _float(row["eps_surprise_percent"])
        if surprise is not None and surprise > 0:
            beat_streak += 1
        else:
            break

    surprises = [_float(r["eps_surprise_percent"]) for r in hist_rows if r["eps_surprise_percent"] is not None]
    avg_surprise = round(sum(surprises) / len(surprises), 2) if surprises else None

    return {
        "next_earnings": next_earnings,
        "beat_streak": beat_streak,
        "avg_eps_surprise_pct": avg_surprise,
        "recent_quarters": len(hist_rows),
    }


async def _fetch_price_targets(conn, symbol: str) -> dict:
    query = """
        SELECT
            analysis_date, latest_close, latest_open,
            entry_price, entry_price_low, entry_price_high,
            target_price, stop_loss,
            signal_summary, confidence, trader_type, metadata
        FROM analysis_ticker_price_targets
        WHERE UPPER(ticker_symbol) = UPPER($1)
        ORDER BY analysis_date DESC
        LIMIT 1
    """

    rows = await _safe_fetch(conn, query, symbol)
    if not rows:
        return {"message": "No price target data"}

    row = rows[0]
    meta = row["metadata"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except (json.JSONDecodeError, TypeError):
            meta = {}

    return {
        "analysis_date": str(row["analysis_date"]),
        "latest_close": _float(row["latest_close"]),
        "entry_price": _float(row["entry_price"]),
        "entry_range": {
            "low": _float(row["entry_price_low"]),
            "high": _float(row["entry_price_high"]),
        },
        "target_price": _float(row["target_price"]),
        "stop_loss": _float(row["stop_loss"]),
        "signal": row["signal_summary"],
        "confidence": _float(row["confidence"]),
        "trader_type": row["trader_type"],
    }
