"""Advanced technical indicator tools (pro tier) — Bollinger, ATR, Stochastic, ADX, OBV, Fibonacci, Pivot, Ichimoku."""

import asyncio
import json
import math
from datetime import date, timedelta
from typing import Optional

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


def _is_crypto(symbol: str) -> bool:
    return "/" in symbol


async def get_advanced_signals(
    conn,
    symbol: str,
    start_date: str,
    end_date: str,
) -> str:
    """
    Get daily advanced technical indicators with signal detection.

    Queries analysis_indicators_stock_pro / analysis_indicators_crypto_pro.
    Detects Bollinger squeeze/breakout, Stochastic crossovers, ADX trend signals,
    Ichimoku TK cross and cloud breakouts, Fibonacci level proximity.
    """
    start_dt = date.fromisoformat(start_date)
    end_dt = date.fromisoformat(end_date)

    retention_limit = date.today() - timedelta(days=90)
    if start_dt < retention_limit:
        return json.dumps({
            "error": "date_range_warning",
            "symbol": symbol.upper(),
            "message": f"Advanced indicator data has 90-day retention. "
                       f"Requested start {start_date} is before retention cutoff {retention_limit}.",
        })

    is_crypto = _is_crypto(symbol)

    if is_crypto:
        tz_expr = "AT TIME ZONE 'UTC'"
        indicator_table = "analysis_indicators_crypto_pro"
        ticker_table = "crypto_tickers"
        fk_col = "crypto_ticker_id"
    else:
        tz_expr = "AT TIME ZONE 'America/New_York'"
        indicator_table = "analysis_indicators_stock_pro"
        ticker_table = "stock_tickers"
        fk_col = "stock_ticker_id"

    query = f"""
        WITH daily AS (
            SELECT DISTINCT ON ((i.indicator_time {tz_expr})::date)
                t.symbol,
                (i.indicator_time {tz_expr})::date AS indicator_date,
                i.bollinger_upper, i.bollinger_lower, i.bollinger_middle, i.bollinger_bandwidth,
                i.atr, i.stoch_k, i.stoch_d, i.adx, i.obv,
                i.fibonacci_levels, i.pivot_levels,
                i.ichimoku_tenkan, i.ichimoku_kijun, i.ichimoku_senkou_a, i.ichimoku_senkou_b, i.ichimoku_chikou
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
            LAG(d.stoch_k) OVER w AS prev_stoch_k,
            LAG(d.stoch_d) OVER w AS prev_stoch_d,
            LAG(d.bollinger_bandwidth) OVER w AS prev_bandwidth,
            LAG(d.adx) OVER w AS prev_adx,
            LAG(d.ichimoku_tenkan) OVER w AS prev_tenkan,
            LAG(d.ichimoku_kijun) OVER w AS prev_kijun
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
            "message": f"No advanced indicator data found for {symbol.upper()} in the specified date range",
            "daily_indicators": [],
            "detected_signals": [],
        })

    daily_indicators = []
    detected_signals = []

    for row in rows:
        day_str = str(row["indicator_date"])
        stoch_k = _float(row["stoch_k"])
        stoch_d = _float(row["stoch_d"])
        bandwidth = _float(row["bollinger_bandwidth"])
        adx = _float(row["adx"])
        tenkan = _float(row["ichimoku_tenkan"])
        kijun = _float(row["ichimoku_kijun"])

        prev_stoch_k = _float(row["prev_stoch_k"])
        prev_stoch_d = _float(row["prev_stoch_d"])
        prev_bandwidth = _float(row["prev_bandwidth"])
        prev_adx = _float(row["prev_adx"])
        prev_tenkan = _float(row["prev_tenkan"])
        prev_kijun = _float(row["prev_kijun"])

        fib_raw = row["fibonacci_levels"]
        pivot_raw = row["pivot_levels"]
        fib = json.loads(fib_raw) if isinstance(fib_raw, str) else (fib_raw or {})
        pivot = json.loads(pivot_raw) if isinstance(pivot_raw, str) else (pivot_raw or {})

        daily_indicators.append({
            "date": day_str,
            "bollinger": {
                "upper": _float(row["bollinger_upper"]),
                "lower": _float(row["bollinger_lower"]),
                "middle": _float(row["bollinger_middle"]),
                "bandwidth": bandwidth,
            },
            "atr": _float(row["atr"]),
            "stochastic": {"k": stoch_k, "d": stoch_d},
            "adx": adx,
            "obv": int(row["obv"]) if row["obv"] is not None else None,
            "fibonacci": fib,
            "pivot_points": pivot,
            "ichimoku": {
                "tenkan": tenkan,
                "kijun": kijun,
                "senkou_a": _float(row["ichimoku_senkou_a"]),
                "senkou_b": _float(row["ichimoku_senkou_b"]),
                "chikou": _float(row["ichimoku_chikou"]),
            },
        })

        # Bollinger squeeze / expansion
        if bandwidth is not None and prev_bandwidth is not None:
            if prev_bandwidth >= 4.0 and bandwidth < 4.0:
                detected_signals.append({
                    "date": day_str, "signal": "bollinger_squeeze_entry",
                    "detail": f"Bollinger bandwidth narrowed to {bandwidth:.2f}% — volatility squeeze",
                })
            elif prev_bandwidth < 4.0 and bandwidth >= 4.0:
                detected_signals.append({
                    "date": day_str, "signal": "bollinger_squeeze_exit",
                    "detail": f"Bollinger bandwidth expanded to {bandwidth:.2f}% — breakout potential",
                })

        # Stochastic crossovers
        if (prev_stoch_k is not None and prev_stoch_d is not None
                and stoch_k is not None and stoch_d is not None):
            if prev_stoch_k <= prev_stoch_d and stoch_k > stoch_d:
                zone = " in oversold zone" if stoch_k < 20 else ""
                detected_signals.append({
                    "date": day_str, "signal": "stochastic_bullish_crossover",
                    "detail": f"%K crossed above %D at {stoch_k:.1f}{zone}",
                })
            elif prev_stoch_k >= prev_stoch_d and stoch_k < stoch_d:
                zone = " in overbought zone" if stoch_k > 80 else ""
                detected_signals.append({
                    "date": day_str, "signal": "stochastic_bearish_crossover",
                    "detail": f"%K crossed below %D at {stoch_k:.1f}{zone}",
                })

        # ADX trend strength
        if adx is not None and prev_adx is not None:
            if prev_adx < 25 and adx >= 25:
                detected_signals.append({
                    "date": day_str, "signal": "adx_trending",
                    "detail": f"ADX crossed above 25 at {adx:.1f} — trend developing",
                })
            elif prev_adx >= 25 and adx < 25:
                detected_signals.append({
                    "date": day_str, "signal": "adx_ranging",
                    "detail": f"ADX fell below 25 to {adx:.1f} — trend weakening",
                })

        # Ichimoku TK cross
        if (prev_tenkan is not None and prev_kijun is not None
                and tenkan is not None and kijun is not None):
            if prev_tenkan <= prev_kijun and tenkan > kijun:
                detected_signals.append({
                    "date": day_str, "signal": "ichimoku_bullish_tk_cross",
                    "detail": "Tenkan-sen crossed above Kijun-sen (bullish)",
                })
            elif prev_tenkan >= prev_kijun and tenkan < kijun:
                detected_signals.append({
                    "date": day_str, "signal": "ichimoku_bearish_tk_cross",
                    "detail": "Tenkan-sen crossed below Kijun-sen (bearish)",
                })

    latest = rows[-1]

    # Current assessment
    latest_bandwidth = _float(latest["bollinger_bandwidth"])
    latest_adx = _float(latest["adx"])
    latest_stoch_k = _float(latest["stoch_k"])
    latest_tenkan = _float(latest["ichimoku_tenkan"])
    latest_kijun = _float(latest["ichimoku_kijun"])
    latest_senkou_a = _float(latest["ichimoku_senkou_a"])
    latest_senkou_b = _float(latest["ichimoku_senkou_b"])
    latest_chikou = _float(latest["ichimoku_chikou"])

    volatility_state = "normal"
    if latest_bandwidth is not None:
        if latest_bandwidth < 4.0:
            volatility_state = "squeeze"
        elif latest_bandwidth > 10.0:
            volatility_state = "expansion"

    trend_strength = "weak"
    if latest_adx is not None:
        if latest_adx >= 40:
            trend_strength = "very_strong"
        elif latest_adx >= 25:
            trend_strength = "strong"

    stoch_zone = "neutral"
    if latest_stoch_k is not None:
        if latest_stoch_k >= 80:
            stoch_zone = "overbought"
        elif latest_stoch_k <= 20:
            stoch_zone = "oversold"

    cloud_position = "unknown"
    if latest_chikou is not None and latest_senkou_a is not None and latest_senkou_b is not None:
        cloud_top = max(latest_senkou_a, latest_senkou_b)
        cloud_bottom = min(latest_senkou_a, latest_senkou_b)
        if latest_chikou > cloud_top:
            cloud_position = "above_cloud"
        elif latest_chikou < cloud_bottom:
            cloud_position = "below_cloud"
        else:
            cloud_position = "inside_cloud"

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
            "volatility_state": volatility_state,
            "trend_strength": trend_strength,
            "stochastic_zone": stoch_zone,
            "ichimoku_cloud_position": cloud_position,
        },
    })


async def get_advanced_custom(
    conn,
    symbol: str,
    indicators: list[str],
    fib_lookback_days: int = 50,
    pivot_type: str = "standard",
) -> str:
    """
    Get advanced indicators with custom parameters.

    Reads pre-computed defaults from DB when standard params are used.
    Computes on-the-fly when custom parameters are requested.
    VWAP is always computed on-demand from intraday 15-min candles.
    """
    is_crypto = _is_crypto(symbol)
    results: dict = {"symbol": symbol.upper(), "asset_type": "crypto" if is_crypto else "stock"}

    if is_crypto:
        candle_table = "analysis_crypto_candlestick_pattern"
        ticker_table = "crypto_tickers"
        fk_col = "crypto_ticker_id"
        adv_table = "analysis_indicators_crypto_pro"
        price_table = "crypto_prices"
        price_fk = "crypto_ticker_id"
    else:
        candle_table = "analysis_stock_candlestick_pattern"
        ticker_table = "stock_tickers"
        fk_col = "stock_ticker_id"
        adv_table = "analysis_indicators_stock_pro"
        price_table = "stock_prices"
        price_fk = "stock_ticker_id"

    for ind in indicators:
        try:
            if ind == "fibonacci":
                if fib_lookback_days == 50:
                    query = f"""
                        SELECT i.fibonacci_levels
                        FROM {adv_table} i
                        JOIN {ticker_table} t ON i.{fk_col} = t.id
                        WHERE UPPER(t.symbol) = UPPER($1)
                        ORDER BY i.indicator_time DESC LIMIT 1
                    """
                    rows = await _safe_fetch(conn, query, symbol)
                    if rows and rows[0]["fibonacci_levels"]:
                        raw = rows[0]["fibonacci_levels"]
                        results["fibonacci"] = json.loads(raw) if isinstance(raw, str) else raw
                    else:
                        results["fibonacci"] = await _compute_fibonacci_on_demand(
                            conn, symbol, candle_table, ticker_table, fk_col, fib_lookback_days)
                else:
                    results["fibonacci"] = await _compute_fibonacci_on_demand(
                        conn, symbol, candle_table, ticker_table, fk_col, fib_lookback_days)

            elif ind == "pivot_points":
                if pivot_type == "standard":
                    query = f"""
                        SELECT i.pivot_levels
                        FROM {adv_table} i
                        JOIN {ticker_table} t ON i.{fk_col} = t.id
                        WHERE UPPER(t.symbol) = UPPER($1)
                        ORDER BY i.indicator_time DESC LIMIT 1
                    """
                    rows = await _safe_fetch(conn, query, symbol)
                    if rows and rows[0]["pivot_levels"]:
                        raw = rows[0]["pivot_levels"]
                        results["pivot_points"] = json.loads(raw) if isinstance(raw, str) else raw
                        results["pivot_type"] = "standard"
                    else:
                        results["pivot_points"] = await _compute_pivot_on_demand(
                            conn, symbol, candle_table, ticker_table, fk_col, pivot_type)
                        results["pivot_type"] = pivot_type
                else:
                    results["pivot_points"] = await _compute_pivot_on_demand(
                        conn, symbol, candle_table, ticker_table, fk_col, pivot_type)
                    results["pivot_type"] = pivot_type

            elif ind == "ichimoku":
                query = f"""
                    SELECT i.ichimoku_tenkan, i.ichimoku_kijun,
                           i.ichimoku_senkou_a, i.ichimoku_senkou_b, i.ichimoku_chikou
                    FROM {adv_table} i
                    JOIN {ticker_table} t ON i.{fk_col} = t.id
                    WHERE UPPER(t.symbol) = UPPER($1)
                    ORDER BY i.indicator_time DESC LIMIT 1
                """
                rows = await _safe_fetch(conn, query, symbol)
                if rows:
                    results["ichimoku"] = {
                        "tenkan": _float(rows[0]["ichimoku_tenkan"]),
                        "kijun": _float(rows[0]["ichimoku_kijun"]),
                        "senkou_a": _float(rows[0]["ichimoku_senkou_a"]),
                        "senkou_b": _float(rows[0]["ichimoku_senkou_b"]),
                        "chikou": _float(rows[0]["ichimoku_chikou"]),
                    }
                else:
                    results["ichimoku"] = {"message": "No Ichimoku data available"}

            elif ind == "vwap":
                results["vwap"] = await _compute_vwap(
                    conn, symbol, price_table, ticker_table, price_fk, is_crypto)

        except asyncio.TimeoutError:
            results[ind] = {"error": f"Query timeout computing {ind}"}
        except Exception as e:
            results[ind] = {"error": str(e)}

    return json.dumps(results, default=str)


async def _compute_fibonacci_on_demand(conn, symbol, candle_table, ticker_table, fk_col, lookback_days):
    query = f"""
        SELECT a.daily_high, a.daily_low
        FROM {candle_table} a
        JOIN {ticker_table} t ON a.{fk_col} = t.id
        WHERE UPPER(t.symbol) = UPPER($1)
          AND a.daily_high IS NOT NULL
        ORDER BY a.analysis_date DESC
        LIMIT $2
    """
    rows = await _safe_fetch(conn, query, symbol, lookback_days)
    if not rows:
        return {"message": f"No OHLCV data found for {symbol.upper()}"}

    swing_high = max(float(r["daily_high"]) for r in rows)
    swing_low = min(float(r["daily_low"]) for r in rows)
    rng = swing_high - swing_low

    return {
        "swing_high": round(swing_high, 6),
        "swing_low": round(swing_low, 6),
        "lookback_days": lookback_days,
        "levels": {
            "0.0": round(swing_high, 6),
            "0.236": round(swing_high - rng * 0.236, 6),
            "0.382": round(swing_high - rng * 0.382, 6),
            "0.5": round(swing_high - rng * 0.5, 6),
            "0.618": round(swing_high - rng * 0.618, 6),
            "0.786": round(swing_high - rng * 0.786, 6),
            "1.0": round(swing_low, 6),
        },
        "extensions": {
            "1.272": round(swing_high + rng * 0.272, 6),
            "1.618": round(swing_high + rng * 0.618, 6),
            "2.618": round(swing_high + rng * 1.618, 6),
        },
    }


async def _compute_pivot_on_demand(conn, symbol, candle_table, ticker_table, fk_col, pivot_type):
    query = f"""
        SELECT a.daily_high, a.daily_low, a.daily_close, a.daily_open
        FROM {candle_table} a
        JOIN {ticker_table} t ON a.{fk_col} = t.id
        WHERE UPPER(t.symbol) = UPPER($1)
          AND a.daily_close IS NOT NULL
        ORDER BY a.analysis_date DESC
        LIMIT 1
    """
    rows = await _safe_fetch(conn, query, symbol)
    if not rows:
        return {"message": f"No OHLCV data found for {symbol.upper()}"}

    h = float(rows[0]["daily_high"])
    l = float(rows[0]["daily_low"])
    c = float(rows[0]["daily_close"])

    if pivot_type == "fibonacci":
        p = (h + l + c) / 3
        rng = h - l
        return {
            "type": "fibonacci",
            "pivot": round(p, 6),
            "s1": round(p - 0.382 * rng, 6), "s2": round(p - 0.618 * rng, 6), "s3": round(p - 1.0 * rng, 6),
            "r1": round(p + 0.382 * rng, 6), "r2": round(p + 0.618 * rng, 6), "r3": round(p + 1.0 * rng, 6),
        }
    elif pivot_type == "camarilla":
        return {
            "type": "camarilla",
            "s1": round(c - (h - l) * 1.1 / 12, 6), "s2": round(c - (h - l) * 1.1 / 6, 6),
            "s3": round(c - (h - l) * 1.1 / 4, 6), "s4": round(c - (h - l) * 1.1 / 2, 6),
            "r1": round(c + (h - l) * 1.1 / 12, 6), "r2": round(c + (h - l) * 1.1 / 6, 6),
            "r3": round(c + (h - l) * 1.1 / 4, 6), "r4": round(c + (h - l) * 1.1 / 2, 6),
        }
    elif pivot_type == "woodie":
        p = (h + l + 2 * c) / 4
        return {
            "type": "woodie",
            "pivot": round(p, 6),
            "s1": round(2 * p - h, 6), "s2": round(p - (h - l), 6),
            "r1": round(2 * p - l, 6), "r2": round(p + (h - l), 6),
        }
    else:
        p = (h + l + c) / 3
        return {
            "type": "standard",
            "pivot": round(p, 6),
            "s1": round(2 * p - h, 6), "s2": round(p - (h - l), 6), "s3": round(l - 2 * (h - p), 6),
            "r1": round(2 * p - l, 6), "r2": round(p + (h - l), 6), "r3": round(h + 2 * (p - l), 6),
        }


async def _compute_vwap(conn, symbol, price_table, ticker_table, price_fk, is_crypto):
    """Compute session VWAP from intraday 15-min candles."""
    if is_crypto:
        tz_filter = "price_time::date = CURRENT_DATE"
    else:
        tz_filter = "(price_time AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date"

    query = f"""
        SELECT p.high_price, p.low_price, p.close_price, p.volume, p.price_time
        FROM {price_table} p
        JOIN {ticker_table} t ON p.{price_fk} = t.id
        WHERE UPPER(t.symbol) = UPPER($1)
          AND {tz_filter}
        ORDER BY p.price_time ASC
    """
    rows = await _safe_fetch(conn, query, symbol)
    if not rows:
        return {"message": f"No intraday data found for {symbol.upper()} today"}

    cum_vol = 0.0
    cum_tp_vol = 0.0
    for r in rows:
        h = float(r["high_price"])
        l = float(r["low_price"])
        c = float(r["close_price"])
        v = float(r["volume"]) if r["volume"] else 0
        tp = (h + l + c) / 3
        cum_tp_vol += tp * v
        cum_vol += v

    vwap = cum_tp_vol / cum_vol if cum_vol > 0 else 0

    return {
        "vwap": round(vwap, 6),
        "candles_used": len(rows),
        "session_volume": round(cum_vol, 2),
        "latest_time": str(rows[-1]["price_time"]),
    }
