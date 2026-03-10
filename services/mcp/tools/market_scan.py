"""Market-wide scan: sentiment, movers, and patterns across stocks and/or crypto."""

import asyncio
import json
from datetime import date, timedelta

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


async def get_market_scan(
    conn,
    asset_type: str = "all",
    direction: str = "all",
    days: int = 1,
    pattern_type: str | None = None,
) -> str:
    """
    Consolidated market-wide scan for sentiment, top movers, and patterns.

    Replaces 8 separate tools: statistics, list_patterns, bullish, bearish
    for both stock and crypto.

    Args:
        conn: Database connection
        asset_type: 'stock', 'crypto', or 'all'
        direction: 'bullish', 'bearish', or 'all'
        days: Number of days to analyze (1-90)
        pattern_type: Optional filter for specific pattern (e.g., 'doji', 'hammer')

    Returns:
        JSON with sentiment summary, top movers, patterns, and daily breakdown
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=max(days - 1, 0))

    scan_stock = asset_type in ("stock", "all")
    scan_crypto = asset_type in ("crypto", "all")

    result: dict = {
        "period": {"start": str(start_date), "end": str(end_date), "days": days},
        "asset_type": asset_type,
        "direction_filter": direction,
    }

    try:
        stock_data = await _scan_asset(conn, "stock", start_date, end_date, direction, pattern_type) if scan_stock else None
        crypto_data = await _scan_asset(conn, "crypto", start_date, end_date, direction, pattern_type) if scan_crypto else None
    except asyncio.TimeoutError:
        return json.dumps({"error": "Query timeout", "message": f"Query took longer than {QUERY_TIMEOUT}s"})

    total_bullish = 0
    total_bearish = 0

    if stock_data:
        result["stocks"] = stock_data
        total_bullish += stock_data["summary"]["bullish_count"]
        total_bearish += stock_data["summary"]["bearish_count"]

    if crypto_data:
        result["crypto"] = crypto_data
        total_bullish += crypto_data["summary"]["bullish_count"]
        total_bearish += crypto_data["summary"]["bearish_count"]

    total = total_bullish + total_bearish
    result["overall_sentiment"] = {
        "bullish_count": total_bullish,
        "bearish_count": total_bearish,
        "bullish_ratio": round(total_bullish / total * 100, 1) if total > 0 else 0,
    }

    return json.dumps(result)


async def _scan_asset(
    conn,
    asset: str,
    start_date: date,
    end_date: date,
    direction: str,
    pattern_type: str | None,
) -> dict:
    if asset == "stock":
        table = "analysis_stock_candlestick_pattern"
        ticker_table = "stock_tickers"
        fk = "stock_ticker_id"
    else:
        table = "analysis_crypto_candlestick_pattern"
        ticker_table = "crypto_tickers"
        fk = "crypto_ticker_id"

    direction_filter = ""
    if direction == "bullish":
        direction_filter = "AND a.is_bullish = true"
    elif direction == "bearish":
        direction_filter = "AND a.is_bullish = false"

    pattern_filter = ""
    pattern_args: list = [start_date, end_date]
    if pattern_type:
        pattern_filter = """AND EXISTS(
            SELECT 1 FROM jsonb_array_elements(a.detected_patterns) p
            WHERE LOWER(p->>'pattern') = LOWER($3))"""
        pattern_args.append(pattern_type)

    movers_query = f"""
        SELECT
            t.symbol, t.name,
            a.analysis_date, a.daily_close, a.body_size, a.is_bullish,
            a.detected_patterns
        FROM {table} a
        JOIN {ticker_table} t ON a.{fk} = t.id
        WHERE a.analysis_date >= $1::date
          AND a.analysis_date <= $2::date
          {direction_filter}
          {pattern_filter}
        ORDER BY a.analysis_date DESC, a.body_size DESC NULLS LAST
        LIMIT 50
    """

    daily_query = f"""
        SELECT
            a.analysis_date,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE a.is_bullish = true) as bullish_count,
            COUNT(*) FILTER (WHERE a.is_bullish = false) as bearish_count,
            COUNT(*) FILTER (WHERE jsonb_array_length(a.detected_patterns) > 0) as with_patterns
        FROM {table} a
        WHERE a.analysis_date >= $1::date
          AND a.analysis_date <= $2::date
        GROUP BY a.analysis_date
        ORDER BY a.analysis_date DESC
    """

    pattern_stats_query = f"""
        SELECT
            p->>'pattern' as pattern_name,
            COUNT(*) as count
        FROM {table} a,
             jsonb_array_elements(a.detected_patterns) as p
        WHERE a.analysis_date >= $1::date
          AND a.analysis_date <= $2::date
        GROUP BY p->>'pattern'
        ORDER BY count DESC
        LIMIT 10
    """

    mover_rows = await _safe_fetch(conn, movers_query, *pattern_args)
    daily_rows = await _safe_fetch(conn, daily_query, start_date, end_date)
    pattern_rows = await _safe_fetch(conn, pattern_stats_query, start_date, end_date)

    total_bullish = sum(r["bullish_count"] for r in daily_rows)
    total_bearish = sum(r["bearish_count"] for r in daily_rows)

    movers = []
    for row in mover_rows:
        patterns = json.loads(row["detected_patterns"]) if row["detected_patterns"] else []
        movers.append({
            "symbol": row["symbol"],
            "name": row["name"],
            "date": str(row["analysis_date"]),
            "close": _float(row["daily_close"]),
            "body_size": _float(row["body_size"]),
            "is_bullish": row["is_bullish"],
            "patterns": [p.get("pattern") for p in patterns] if patterns else [],
        })

    daily = []
    for row in daily_rows:
        total_day = row["total"]
        daily.append({
            "date": str(row["analysis_date"]),
            "total": total_day,
            "bullish": row["bullish_count"],
            "bearish": row["bearish_count"],
            "with_patterns": row["with_patterns"],
            "bullish_ratio": round(row["bullish_count"] / total_day * 100, 1) if total_day > 0 else 0,
        })

    top_patterns = [
        {"pattern": row["pattern_name"], "count": row["count"]}
        for row in pattern_rows
    ]

    return {
        "summary": {
            "bullish_count": total_bullish,
            "bearish_count": total_bearish,
        },
        "movers": movers,
        "daily_breakdown": daily,
        "top_patterns": top_patterns,
    }
