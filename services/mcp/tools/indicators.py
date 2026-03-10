"""Unified technical indicator tools with signal detection (stocks + crypto)."""

import asyncio
import json
from datetime import date, timedelta

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


def _is_crypto(symbol: str) -> bool:
    return "/" in symbol


async def get_technical_signals(
    conn,
    symbol: str,
    start_date: str,
    end_date: str,
) -> str:
    """
    Get daily technical indicators with signal detection for a stock or crypto.

    Auto-detects asset type from symbol format (BTC/USD = crypto).

    Computes MACD crossovers, RSI zone transitions, and EMA/SMA crossovers
    using SQL window functions over daily snapshots (latest reading per day).

    Args:
        conn: Database connection
        symbol: Ticker symbol (e.g., 'AAPL' or 'BTC/USD')
        start_date: Start date YYYY-MM-DD
        end_date: End date YYYY-MM-DD

    Returns:
        JSON with daily indicators, detected signals, and current assessment
    """
    start_dt = date.fromisoformat(start_date)
    end_dt = date.fromisoformat(end_date)

    retention_limit = date.today() - timedelta(days=90)
    if start_dt < retention_limit:
        return json.dumps({
            "error": "date_range_warning",
            "symbol": symbol.upper(),
            "message": (
                f"Indicator data has 90-day retention. "
                f"Requested start {start_date} is before retention cutoff {retention_limit}. "
                f"Results may be incomplete."
            ),
        })

    is_crypto = _is_crypto(symbol)

    if is_crypto:
        tz_expr = "AT TIME ZONE 'UTC'"
        indicator_table = "analysis_crypto_indicator"
        ticker_table = "crypto_tickers"
        fk_col = "crypto_ticker_id"
    else:
        tz_expr = "AT TIME ZONE 'America/New_York'"
        indicator_table = "analysis_stock_indicator"
        ticker_table = "stock_tickers"
        fk_col = "stock_ticker_id"

    query = f"""
        WITH daily AS (
            SELECT DISTINCT ON ((i.indicator_time {tz_expr})::date)
                t.symbol,
                (i.indicator_time {tz_expr})::date AS indicator_date,
                i.sma, i.ema,
                i.macd_value, i.macd_signal, i.macd_histogram,
                i.rsi
            FROM {indicator_table} i
            JOIN {ticker_table} t ON i.{fk_col} = t.id
            WHERE UPPER(t.symbol) = UPPER($1)
              AND i.indicator_time >= $2::date
              AND i.indicator_time < ($3::date + 1)
            ORDER BY (i.indicator_time {tz_expr})::date,
                     i.indicator_time DESC
        )
        SELECT
            d.*,
            LAG(d.macd_histogram) OVER w AS prev_macd_histogram,
            LAG(d.rsi)            OVER w AS prev_rsi,
            LAG(d.ema)            OVER w AS prev_ema,
            LAG(d.sma)            OVER w AS prev_sma
        FROM daily d
        WINDOW w AS (ORDER BY d.indicator_date)
        ORDER BY d.indicator_date
    """

    try:
        rows = await _safe_fetch(conn, query, symbol, start_dt, end_dt)
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "symbol": symbol.upper(),
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not rows:
        return json.dumps({
            "symbol": symbol.upper(),
            "asset_type": "crypto" if is_crypto else "stock",
            "start_date": start_date,
            "end_date": end_date,
            "message": f"No indicator data found for {symbol.upper()} in the specified date range",
            "daily_indicators": [],
            "detected_signals": [],
        })

    daily_indicators = []
    detected_signals = []

    for row in rows:
        day_str = str(row["indicator_date"])
        rsi = _float(row["rsi"])
        macd_hist = _float(row["macd_histogram"])
        ema = _float(row["ema"])
        sma = _float(row["sma"])
        prev_hist = _float(row["prev_macd_histogram"])
        prev_rsi = _float(row["prev_rsi"])
        prev_ema = _float(row["prev_ema"])
        prev_sma = _float(row["prev_sma"])

        daily_indicators.append({
            "date": day_str,
            "sma": sma,
            "ema": ema,
            "rsi": rsi,
            "macd": {
                "value": _float(row["macd_value"]),
                "signal": _float(row["macd_signal"]),
                "histogram": macd_hist,
            },
        })

        if prev_hist is not None and macd_hist is not None:
            if prev_hist <= 0 < macd_hist:
                detected_signals.append({
                    "date": day_str,
                    "signal": "macd_bullish_crossover",
                    "detail": "MACD crossed above signal line",
                })
            elif prev_hist >= 0 > macd_hist:
                detected_signals.append({
                    "date": day_str,
                    "signal": "macd_bearish_crossover",
                    "detail": "MACD crossed below signal line",
                })

        if prev_rsi is not None and rsi is not None:
            if prev_rsi < 70 <= rsi:
                detected_signals.append({
                    "date": day_str,
                    "signal": "rsi_overbought_entry",
                    "detail": f"RSI entered overbought zone at {rsi:.1f}",
                })
            elif prev_rsi >= 70 > rsi:
                detected_signals.append({
                    "date": day_str,
                    "signal": "rsi_overbought_exit",
                    "detail": f"RSI exited overbought zone to {rsi:.1f}",
                })
            elif prev_rsi > 30 >= rsi:
                detected_signals.append({
                    "date": day_str,
                    "signal": "rsi_oversold_entry",
                    "detail": f"RSI entered oversold zone at {rsi:.1f}",
                })
            elif prev_rsi <= 30 < rsi:
                detected_signals.append({
                    "date": day_str,
                    "signal": "rsi_oversold_exit",
                    "detail": f"RSI exited oversold zone to {rsi:.1f}",
                })

        if (prev_ema is not None and prev_sma is not None
                and ema is not None and sma is not None):
            if prev_ema <= prev_sma and ema > sma:
                detected_signals.append({
                    "date": day_str,
                    "signal": "ema_above_sma",
                    "detail": "EMA crossed above SMA (bullish trend shift)",
                })
            elif prev_ema >= prev_sma and ema < sma:
                detected_signals.append({
                    "date": day_str,
                    "signal": "ema_below_sma",
                    "detail": "EMA crossed below SMA (bearish trend shift)",
                })

    latest = rows[-1]
    latest_rsi = _float(latest["rsi"])
    latest_hist = _float(latest["macd_histogram"])
    latest_ema = _float(latest["ema"])
    latest_sma = _float(latest["sma"])

    rsi_zone = "neutral"
    if latest_rsi is not None:
        if latest_rsi >= 70:
            rsi_zone = "overbought"
        elif latest_rsi <= 30:
            rsi_zone = "oversold"

    macd_momentum = "neutral"
    if latest_hist is not None:
        macd_momentum = "bullish" if latest_hist > 0 else "bearish"

    trend = "neutral"
    if latest_ema is not None and latest_sma is not None:
        trend = "ema_above_sma" if latest_ema > latest_sma else "ema_below_sma"

    return json.dumps({
        "symbol": symbol.upper(),
        "asset_type": "crypto" if is_crypto else "stock",
        "period": {
            "start": start_date,
            "end": end_date,
            "trading_days": len(daily_indicators),
        },
        "daily_indicators": daily_indicators,
        "detected_signals": detected_signals,
        "current_assessment": {
            "rsi_zone": rsi_zone,
            "macd_momentum": macd_momentum,
            "trend": trend,
        },
    })
