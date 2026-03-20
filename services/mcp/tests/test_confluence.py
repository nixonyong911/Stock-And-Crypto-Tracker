"""Tests for confluence scoring logic in confluence.py"""

import json
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.confluence import (
    _float,
    _is_crypto,
)


class FakeRow(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


class FakeConn:
    """Returns different rows based on query pattern matching."""

    def __init__(self, basic=None, advanced=None, candles=None):
        self._basic = basic or []
        self._advanced = advanced or []
        self._candles = candles or []

    async def execute(self, query, *args, timeout=None):
        pass

    async def fetch(self, query, *args, timeout=None):
        q = query.lower()
        if "analysis_indicators_stock_pro" in q or "analysis_indicators_crypto_pro" in q:
            return self._advanced
        elif "analysis_indicators_stock_free" in q or "analysis_indicators_crypto_free" in q:
            return self._basic
        elif "candlestick_pattern" in q:
            return self._candles
        return []


def test_is_crypto():
    assert _is_crypto("BTC/USD") is True
    assert _is_crypto("AAPL") is False


def test_float_helpers():
    assert _float(None) is None
    assert _float(42) == 42.0
    assert _float(3.14) == 3.14


@pytest.mark.asyncio
async def test_confluence_no_basic_data():
    """When no basic data exists, should return error message."""
    from tools.confluence import get_confluence_score

    conn = FakeConn()
    result = json.loads(await get_confluence_score(conn, "AAPL"))

    assert result["symbol"] == "AAPL"
    assert "message" in result
    assert "No basic indicator data" in result["message"]


@pytest.mark.asyncio
async def test_confluence_basic_only():
    """When only basic data, advanced scores default to 50."""
    from tools.confluence import get_confluence_score

    basic = [FakeRow({
        "sma": 150, "ema": 155, "macd_value": 2.5, "macd_signal": 2.0,
        "macd_histogram": 0.5, "rsi": 55,
    })]
    candles = [
        FakeRow({"daily_close": 160, "daily_open": 155, "daily_high": 162, "daily_low": 153}),
        FakeRow({"daily_close": 155, "daily_open": 150, "daily_high": 157, "daily_low": 148}),
    ]

    conn = FakeConn(basic=basic, candles=candles)
    result = json.loads(await get_confluence_score(conn, "AAPL"))

    assert result["symbol"] == "AAPL"
    assert "confluence_score" in result
    assert 0 <= result["confluence_score"] <= 100
    assert result["signal"] in ("strong_bullish", "bullish", "neutral", "bearish", "strong_bearish")
    assert "category_scores" in result
    assert all(k in result["category_scores"] for k in ("trend", "momentum", "volatility", "volume", "key_levels"))


@pytest.mark.asyncio
async def test_confluence_full_data_bullish():
    """All bullish signals should produce a high confluence score."""
    from tools.confluence import get_confluence_score

    basic = [FakeRow({
        "sma": 140, "ema": 150, "macd_value": 3.0, "macd_signal": 2.0,
        "macd_histogram": 1.0, "rsi": 65,
    })]
    adv = [FakeRow({
        "bollinger_upper": 170, "bollinger_lower": 130, "bollinger_middle": 150,
        "bollinger_bandwidth": 8.0, "atr": 5.5,
        "stoch_k": 75, "stoch_d": 70, "adx": 35, "obv": 50000,
        "fibonacci_levels": json.dumps({"swing_high": 170, "swing_low": 130, "levels": {"0.5": 150}}),
        "pivot_levels": json.dumps({"pivot": 145, "s1": 135, "r1": 155}),
        "ichimoku_tenkan": 155, "ichimoku_kijun": 148,
        "ichimoku_senkou_a": 152, "ichimoku_senkou_b": 145, "ichimoku_chikou": 160,
    })]
    candles = [
        FakeRow({"daily_close": 160, "daily_open": 155, "daily_high": 162, "daily_low": 153}),
        FakeRow({"daily_close": 155, "daily_open": 150, "daily_high": 157, "daily_low": 148}),
    ]

    conn = FakeConn(basic=basic, advanced=adv, candles=candles)
    result = json.loads(await get_confluence_score(conn, "AAPL"))

    assert result["confluence_score"] >= 55
    assert result["signal"] in ("strong_bullish", "bullish")


@pytest.mark.asyncio
async def test_confluence_full_data_bearish():
    """All bearish signals should produce a low confluence score."""
    from tools.confluence import get_confluence_score

    basic = [FakeRow({
        "sma": 160, "ema": 150, "macd_value": -3.0, "macd_signal": -2.0,
        "macd_histogram": -1.0, "rsi": 25,
    })]
    adv = [FakeRow({
        "bollinger_upper": 170, "bollinger_lower": 130, "bollinger_middle": 150,
        "bollinger_bandwidth": 8.0, "atr": 5.5,
        "stoch_k": 15, "stoch_d": 20, "adx": 35, "obv": -50000,
        "fibonacci_levels": json.dumps({"swing_high": 170, "swing_low": 130, "levels": {"0.5": 150}}),
        "pivot_levels": json.dumps({"pivot": 155, "s1": 145, "r1": 165}),
        "ichimoku_tenkan": 145, "ichimoku_kijun": 155,
        "ichimoku_senkou_a": 152, "ichimoku_senkou_b": 158, "ichimoku_chikou": 140,
    })]
    candles = [
        FakeRow({"daily_close": 135, "daily_open": 140, "daily_high": 142, "daily_low": 133}),
        FakeRow({"daily_close": 140, "daily_open": 145, "daily_high": 147, "daily_low": 138}),
    ]

    conn = FakeConn(basic=basic, advanced=adv, candles=candles)
    result = json.loads(await get_confluence_score(conn, "AAPL"))

    assert result["confluence_score"] <= 45
    assert result["signal"] in ("strong_bearish", "bearish")


@pytest.mark.asyncio
async def test_confluence_weights_sum_to_one():
    """Verify category weights sum to 1.0."""
    from tools.confluence import get_confluence_score

    basic = [FakeRow({"sma": 100, "ema": 100, "macd_value": 0, "macd_signal": 0, "macd_histogram": 0, "rsi": 50})]
    candles = [FakeRow({"daily_close": 100, "daily_open": 100, "daily_high": 100, "daily_low": 100})]

    conn = FakeConn(basic=basic, candles=candles)
    result = json.loads(await get_confluence_score(conn, "AAPL"))

    weights = result["weights"]
    assert abs(sum(weights.values()) - 1.0) < 0.001
