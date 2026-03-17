"""Tests for on-demand indicator computation in advanced_indicators.py"""

import json
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.advanced_indicators import (
    _compute_fibonacci_on_demand,
    _compute_pivot_on_demand,
    _compute_vwap,
    _is_crypto,
    _float,
)


# ================================================================
# Helpers
# ================================================================

class FakeRow(dict):
    """dict subclass that supports both key and attribute access."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


class FakeConn:
    """Fake asyncpg connection that returns pre-configured rows."""

    def __init__(self, rows=None):
        self._rows = rows or []

    async def execute(self, query, *args, timeout=None):
        pass

    async def fetch(self, query, *args, timeout=None):
        return self._rows


# ================================================================
# _is_crypto
# ================================================================

def test_is_crypto_with_slash():
    assert _is_crypto("BTC/USD") is True

def test_is_crypto_stock():
    assert _is_crypto("AAPL") is False


# ================================================================
# _float
# ================================================================

def test_float_none():
    assert _float(None) is None

def test_float_decimal():
    from decimal import Decimal
    assert _float(Decimal("3.14")) == 3.14

def test_float_int():
    assert _float(42) == 42.0


# ================================================================
# Fibonacci on-demand
# ================================================================

@pytest.mark.asyncio
async def test_fibonacci_on_demand_basic():
    rows = [
        FakeRow({"daily_high": 150, "daily_low": 100}),
        FakeRow({"daily_high": 145, "daily_low": 105}),
        FakeRow({"daily_high": 140, "daily_low": 110}),
    ]
    conn = FakeConn(rows)

    result = await _compute_fibonacci_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", 50,
    )

    assert result["swing_high"] == 150.0
    assert result["swing_low"] == 100.0
    assert result["lookback_days"] == 50

    levels = result["levels"]
    assert "0.0" in levels
    assert "0.236" in levels
    assert "0.382" in levels
    assert "0.5" in levels
    assert "0.618" in levels
    assert "0.786" in levels
    assert "1.0" in levels

    assert levels["0.0"] == 150.0
    assert levels["1.0"] == 100.0
    assert levels["0.5"] == 125.0

    extensions = result["extensions"]
    assert "1.272" in extensions
    assert "1.618" in extensions


@pytest.mark.asyncio
async def test_fibonacci_on_demand_no_data():
    conn = FakeConn([])
    result = await _compute_fibonacci_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", 50,
    )
    assert "message" in result


@pytest.mark.asyncio
async def test_fibonacci_on_demand_extensions_above_swing_high():
    rows = [
        FakeRow({"daily_high": 200, "daily_low": 100}),
    ]
    conn = FakeConn(rows)

    result = await _compute_fibonacci_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", 50,
    )

    assert result["extensions"]["1.272"] > 200.0


# ================================================================
# Pivot Points on-demand (all types)
# ================================================================

@pytest.mark.asyncio
async def test_pivot_standard():
    rows = [
        FakeRow({"daily_high": 110, "daily_low": 90, "daily_close": 105, "daily_open": 100}),
    ]
    conn = FakeConn(rows)

    result = await _compute_pivot_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", "standard",
    )

    assert result["type"] == "standard"
    expected_pivot = round((110 + 90 + 105) / 3, 6)
    assert result["pivot"] == expected_pivot
    assert "s1" in result and "s2" in result and "s3" in result
    assert "r1" in result and "r2" in result and "r3" in result
    assert result["r1"] > result["pivot"] > result["s1"]


@pytest.mark.asyncio
async def test_pivot_fibonacci():
    rows = [
        FakeRow({"daily_high": 110, "daily_low": 90, "daily_close": 100, "daily_open": 95}),
    ]
    conn = FakeConn(rows)

    result = await _compute_pivot_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", "fibonacci",
    )

    assert result["type"] == "fibonacci"
    assert "pivot" in result
    assert result["r1"] > result["pivot"] > result["s1"]


@pytest.mark.asyncio
async def test_pivot_camarilla():
    rows = [
        FakeRow({"daily_high": 110, "daily_low": 90, "daily_close": 100, "daily_open": 95}),
    ]
    conn = FakeConn(rows)

    result = await _compute_pivot_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", "camarilla",
    )

    assert result["type"] == "camarilla"
    assert "s1" in result and "s4" in result
    assert "r1" in result and "r4" in result
    assert result["r4"] > result["r1"]
    assert result["s4"] < result["s1"]


@pytest.mark.asyncio
async def test_pivot_woodie():
    rows = [
        FakeRow({"daily_high": 110, "daily_low": 90, "daily_close": 100, "daily_open": 95}),
    ]
    conn = FakeConn(rows)

    result = await _compute_pivot_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", "woodie",
    )

    assert result["type"] == "woodie"
    expected_pivot = round((110 + 90 + 2 * 100) / 4, 6)
    assert result["pivot"] == expected_pivot


@pytest.mark.asyncio
async def test_pivot_no_data():
    conn = FakeConn([])
    result = await _compute_pivot_on_demand(
        conn, "AAPL", "analysis_stock_candlestick_pattern",
        "stock_tickers", "stock_ticker_id", "standard",
    )
    assert "message" in result


# ================================================================
# VWAP on-demand
# ================================================================

@pytest.mark.asyncio
async def test_vwap_basic():
    rows = [
        FakeRow({"high_price": 105, "low_price": 95, "close_price": 100, "volume": 1000, "price_time": "2026-03-17T10:00:00"}),
        FakeRow({"high_price": 108, "low_price": 97, "close_price": 103, "volume": 2000, "price_time": "2026-03-17T10:15:00"}),
    ]
    conn = FakeConn(rows)

    result = await _compute_vwap(
        conn, "AAPL", "stock_prices", "stock_tickers", "stock_ticker_id", False,
    )

    assert "vwap" in result
    assert result["candles_used"] == 2
    assert result["session_volume"] == 3000.0
    assert result["vwap"] > 0

    # Manual VWAP calculation
    tp1 = (105 + 95 + 100) / 3
    tp2 = (108 + 97 + 103) / 3
    expected_vwap = round((tp1 * 1000 + tp2 * 2000) / 3000, 6)
    assert result["vwap"] == expected_vwap


@pytest.mark.asyncio
async def test_vwap_no_data():
    conn = FakeConn([])
    result = await _compute_vwap(
        conn, "AAPL", "stock_prices", "stock_tickers", "stock_ticker_id", False,
    )
    assert "message" in result


@pytest.mark.asyncio
async def test_vwap_zero_volume():
    rows = [
        FakeRow({"high_price": 100, "low_price": 90, "close_price": 95, "volume": 0, "price_time": "2026-03-17T10:00:00"}),
    ]
    conn = FakeConn(rows)

    result = await _compute_vwap(
        conn, "AAPL", "stock_prices", "stock_tickers", "stock_ticker_id", False,
    )

    assert result["vwap"] == 0
