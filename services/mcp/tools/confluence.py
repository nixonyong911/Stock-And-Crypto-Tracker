"""Signal confluence scoring tool (pro tier) — combines basic + advanced indicators."""

import asyncio
import json
from datetime import date

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


def _is_crypto(symbol: str) -> bool:
    return "/" in symbol


async def get_confluence_score(conn, symbol: str) -> str:
    """
    Composite signal scoring for a single ticker.

    Reads from BOTH basic indicator tables (SMA/EMA/MACD/RSI) and advanced tables
    (Bollinger, ATR, Stochastic, ADX, OBV, Fibonacci, Pivot, Ichimoku).

    Scores 5 categories (0-100 each) and produces an overall confluence score:
      - Trend: SMA/EMA crossover, ADX, Ichimoku cloud
      - Momentum: RSI, MACD histogram, Stochastic
      - Volatility: Bollinger position/bandwidth, ATR
      - Volume: OBV direction
      - Key Levels: Fibonacci proximity, Pivot position
    """
    is_crypto = _is_crypto(symbol)

    if is_crypto:
        basic_table = "analysis_indicators_crypto_free"
        adv_table = "analysis_indicators_crypto_pro"
        candle_table = "analysis_crypto_candlestick_pattern"
        ticker_table = "crypto_tickers"
        fk_col = "crypto_ticker_id"
    else:
        basic_table = "analysis_indicators_stock_free"
        adv_table = "analysis_indicators_stock_pro"
        candle_table = "analysis_stock_candlestick_pattern"
        ticker_table = "stock_tickers"
        fk_col = "stock_ticker_id"

    basic_query = f"""
        SELECT i.sma, i.ema, i.macd_value, i.macd_signal, i.macd_histogram, i.rsi
        FROM {basic_table} i
        JOIN {ticker_table} t ON i.{fk_col} = t.id
        WHERE UPPER(t.symbol) = UPPER($1)
        ORDER BY i.indicator_time DESC LIMIT 1
    """
    adv_query = f"""
        SELECT i.bollinger_upper, i.bollinger_lower, i.bollinger_middle, i.bollinger_bandwidth,
               i.atr, i.stoch_k, i.stoch_d, i.adx, i.obv,
               i.fibonacci_levels, i.pivot_levels,
               i.ichimoku_tenkan, i.ichimoku_kijun, i.ichimoku_senkou_a, i.ichimoku_senkou_b, i.ichimoku_chikou
        FROM {adv_table} i
        JOIN {ticker_table} t ON i.{fk_col} = t.id
        WHERE UPPER(t.symbol) = UPPER($1)
        ORDER BY i.indicator_time DESC LIMIT 1
    """
    candle_query = f"""
        SELECT a.daily_close, a.daily_open, a.daily_high, a.daily_low
        FROM {candle_table} a
        JOIN {ticker_table} t ON a.{fk_col} = t.id
        WHERE UPPER(t.symbol) = UPPER($1)
        ORDER BY a.analysis_date DESC LIMIT 2
    """

    try:
        basic_rows = await _safe_fetch(conn, basic_query, symbol)
        adv_rows = await _safe_fetch(conn, adv_query, symbol)
        candle_rows = await _safe_fetch(conn, candle_query, symbol)
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "symbol": symbol.upper(),
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not basic_rows:
        return json.dumps({
            "symbol": symbol.upper(),
            "message": "No basic indicator data found. Cannot compute confluence score.",
        })

    basic = basic_rows[0]
    adv = adv_rows[0] if adv_rows else {}
    latest_close = float(candle_rows[0]["daily_close"]) if candle_rows and candle_rows[0]["daily_close"] else None

    scores = {}
    signals = []
    divergences = []

    # ----------------------------------------------------------------
    # 1. TREND SCORE (0-100)
    # ----------------------------------------------------------------
    trend_points = []

    sma = _float(basic.get("sma"))
    ema = _float(basic.get("ema"))
    if sma is not None and ema is not None:
        if ema > sma:
            trend_points.append(70)
            signals.append("EMA above SMA (bullish trend)")
        else:
            trend_points.append(30)
            signals.append("EMA below SMA (bearish trend)")

    adx = _float(adv.get("adx"))
    if adx is not None:
        if adx >= 40:
            trend_points.append(90)
        elif adx >= 25:
            trend_points.append(70)
        else:
            trend_points.append(40)

    tenkan = _float(adv.get("ichimoku_tenkan"))
    kijun = _float(adv.get("ichimoku_kijun"))
    senkou_a = _float(adv.get("ichimoku_senkou_a"))
    senkou_b = _float(adv.get("ichimoku_senkou_b"))
    chikou = _float(adv.get("ichimoku_chikou"))

    if tenkan is not None and kijun is not None:
        if tenkan > kijun:
            trend_points.append(70)
        else:
            trend_points.append(30)

    if chikou is not None and senkou_a is not None and senkou_b is not None:
        cloud_top = max(senkou_a, senkou_b)
        cloud_bottom = min(senkou_a, senkou_b)
        if chikou > cloud_top:
            trend_points.append(80)
            signals.append("Price above Ichimoku cloud (bullish)")
        elif chikou < cloud_bottom:
            trend_points.append(20)
            signals.append("Price below Ichimoku cloud (bearish)")
        else:
            trend_points.append(50)

    scores["trend"] = round(sum(trend_points) / len(trend_points)) if trend_points else 50

    # ----------------------------------------------------------------
    # 2. MOMENTUM SCORE (0-100)
    # ----------------------------------------------------------------
    momentum_points = []

    rsi = _float(basic.get("rsi"))
    if rsi is not None:
        if rsi >= 70:
            momentum_points.append(80)
            signals.append(f"RSI overbought at {rsi:.1f}")
        elif rsi <= 30:
            momentum_points.append(20)
            signals.append(f"RSI oversold at {rsi:.1f}")
        elif rsi >= 50:
            momentum_points.append(60 + (rsi - 50) * 0.5)
        else:
            momentum_points.append(40 - (50 - rsi) * 0.5)

    macd_hist = _float(basic.get("macd_histogram"))
    if macd_hist is not None:
        if macd_hist > 0:
            momentum_points.append(65)
            signals.append("MACD histogram positive (bullish momentum)")
        else:
            momentum_points.append(35)
            signals.append("MACD histogram negative (bearish momentum)")

    stoch_k = _float(adv.get("stoch_k"))
    stoch_d = _float(adv.get("stoch_d"))
    if stoch_k is not None:
        if stoch_k >= 80:
            momentum_points.append(80)
        elif stoch_k <= 20:
            momentum_points.append(20)
        else:
            momentum_points.append(stoch_k)

    scores["momentum"] = round(sum(momentum_points) / len(momentum_points)) if momentum_points else 50

    # ----------------------------------------------------------------
    # 3. VOLATILITY SCORE (0-100) — higher = more bullish positioning
    # ----------------------------------------------------------------
    vol_points = []

    bb_upper = _float(adv.get("bollinger_upper"))
    bb_lower = _float(adv.get("bollinger_lower"))
    bb_middle = _float(adv.get("bollinger_middle"))
    bandwidth = _float(adv.get("bollinger_bandwidth"))

    if latest_close is not None and bb_upper is not None and bb_lower is not None and bb_middle is not None:
        bb_range = bb_upper - bb_lower
        if bb_range > 0:
            bb_position = (latest_close - bb_lower) / bb_range * 100
            vol_points.append(min(max(bb_position, 0), 100))

            if latest_close > bb_upper:
                signals.append("Price above upper Bollinger Band (potential reversal)")
            elif latest_close < bb_lower:
                signals.append("Price below lower Bollinger Band (potential bounce)")

    if bandwidth is not None:
        if bandwidth < 4.0:
            signals.append(f"Bollinger squeeze (bandwidth {bandwidth:.2f}%) — breakout imminent")
            vol_points.append(50)
        else:
            vol_points.append(60)

    scores["volatility"] = round(sum(vol_points) / len(vol_points)) if vol_points else 50

    # ----------------------------------------------------------------
    # 4. VOLUME SCORE (0-100)
    # ----------------------------------------------------------------
    obv = adv.get("obv")
    if obv is not None:
        obv_val = int(obv)
        if obv_val > 0:
            scores["volume"] = 65
            signals.append("OBV positive (buying pressure)")
        elif obv_val < 0:
            scores["volume"] = 35
            signals.append("OBV negative (selling pressure)")
        else:
            scores["volume"] = 50
    else:
        scores["volume"] = 50

    # ----------------------------------------------------------------
    # 5. KEY LEVELS SCORE (0-100)
    # ----------------------------------------------------------------
    level_points = []

    fib_raw = adv.get("fibonacci_levels")
    if fib_raw and latest_close is not None:
        fib = json.loads(fib_raw) if isinstance(fib_raw, str) else fib_raw
        levels = fib.get("levels", {})
        swing_high = fib.get("swing_high")
        swing_low = fib.get("swing_low")
        if swing_high and swing_low:
            fib_range = float(swing_high) - float(swing_low)
            if fib_range > 0:
                fib_position = (latest_close - float(swing_low)) / fib_range * 100
                level_points.append(min(max(fib_position, 0), 100))

    pivot_raw = adv.get("pivot_levels")
    if pivot_raw and latest_close is not None:
        pivot = json.loads(pivot_raw) if isinstance(pivot_raw, str) else pivot_raw
        pp = pivot.get("pivot")
        if pp is not None:
            if latest_close > float(pp):
                level_points.append(65)
                signals.append("Price above pivot point (bullish)")
            else:
                level_points.append(35)
                signals.append("Price below pivot point (bearish)")

    scores["key_levels"] = round(sum(level_points) / len(level_points)) if level_points else 50

    # ----------------------------------------------------------------
    # DIVERGENCE DETECTION
    # ----------------------------------------------------------------
    if rsi is not None and latest_close is not None and candle_rows and len(candle_rows) >= 2:
        prev_close = float(candle_rows[1]["daily_close"]) if candle_rows[1]["daily_close"] else None
        if prev_close is not None:
            if latest_close > prev_close and rsi < 50:
                divergences.append("Price rising but RSI below 50 — potential bearish divergence")
            elif latest_close < prev_close and rsi > 50:
                divergences.append("Price falling but RSI above 50 — potential bullish divergence")

    if macd_hist is not None and stoch_k is not None:
        if macd_hist > 0 and stoch_k < 20:
            divergences.append("MACD bullish but Stochastic oversold — mixed signals")
        elif macd_hist < 0 and stoch_k > 80:
            divergences.append("MACD bearish but Stochastic overbought — mixed signals")

    # ----------------------------------------------------------------
    # OVERALL CONFLUENCE
    # ----------------------------------------------------------------
    weights = {"trend": 0.30, "momentum": 0.25, "volatility": 0.15, "volume": 0.15, "key_levels": 0.15}
    overall = sum(scores.get(k, 50) * w for k, w in weights.items())
    overall = round(overall)

    if overall >= 75:
        signal = "strong_bullish"
    elif overall >= 60:
        signal = "bullish"
    elif overall >= 40:
        signal = "neutral"
    elif overall >= 25:
        signal = "bearish"
    else:
        signal = "strong_bearish"

    return json.dumps({
        "symbol": symbol.upper(),
        "asset_type": "crypto" if is_crypto else "stock",
        "confluence_score": overall,
        "signal": signal,
        "category_scores": scores,
        "weights": weights,
        "signals": signals,
        "divergences": divergences,
        "latest_close": latest_close,
    })
