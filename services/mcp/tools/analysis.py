"""Analysis tools for querying candlestick pattern data."""

import asyncio
import json
from datetime import date, timedelta
from typing import Optional

# Query timeout in seconds (fail fast)
QUERY_TIMEOUT = 10.0


async def get_stock_analysis(
    conn,
    symbol: str,
    start_date: str,
    end_date: str
) -> str:
    """
    Query candlestick analysis for a stock symbol within a date range.
    
    Args:
        conn: Database connection (injected via Depends)
        symbol: Stock ticker symbol (e.g., 'AAPL', 'MSFT')
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
    
    Returns:
        JSON string with analysis data
    """
    query = """
        SELECT 
            st.symbol,
            a.analysis_date,
            a.daily_open,
            a.daily_high,
            a.daily_low,
            a.daily_close,
            a.daily_volume,
            a.body_size,
            a.range_size,
            a.upper_wick,
            a.lower_wick,
            a.is_bullish,
            a.detected_patterns,
            a.candles_aggregated
        FROM analysis_stock_candlestick_pattern a
        JOIN stock_tickers st ON a.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
          AND a.analysis_date >= $2::date
          AND a.analysis_date <= $3::date
        ORDER BY a.analysis_date DESC
    """
    
    # Convert string dates to date objects for asyncpg
    start_date_obj = date.fromisoformat(start_date)
    end_date_obj = date.fromisoformat(end_date)
    
    try:
        rows = await asyncio.wait_for(
            conn.fetch(query, symbol, start_date_obj, end_date_obj),
            timeout=QUERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "symbol": symbol.upper(),
            "message": f"Query took longer than {QUERY_TIMEOUT}s"
        })
    
    if not rows:
        return json.dumps({
            "symbol": symbol.upper(),
            "start_date": start_date,
            "end_date": end_date,
            "message": f"No analysis data found for {symbol.upper()} in the specified date range",
            "results": []
        })
    
    results = []
    for row in rows:
        results.append({
            "symbol": row["symbol"],
            "date": str(row["analysis_date"]),
            "daily_candle": {
                "open": float(row["daily_open"]) if row["daily_open"] else None,
                "high": float(row["daily_high"]) if row["daily_high"] else None,
                "low": float(row["daily_low"]) if row["daily_low"] else None,
                "close": float(row["daily_close"]) if row["daily_close"] else None,
                "volume": int(row["daily_volume"]) if row["daily_volume"] else None,
            },
            "characteristics": {
                "body_size": float(row["body_size"]) if row["body_size"] else None,
                "range_size": float(row["range_size"]) if row["range_size"] else None,
                "upper_wick": float(row["upper_wick"]) if row["upper_wick"] else None,
                "lower_wick": float(row["lower_wick"]) if row["lower_wick"] else None,
                "is_bullish": row["is_bullish"],
            },
            "detected_patterns": json.loads(row["detected_patterns"]) if row["detected_patterns"] else [],
            "candles_aggregated": row["candles_aggregated"],
        })
    
    return json.dumps({
        "symbol": symbol.upper(),
        "start_date": start_date,
        "end_date": end_date,
        "total_results": len(results),
        "results": results
    })


async def list_detected_patterns(
    conn,
    analysis_date: str,
    pattern_type: Optional[str] = None
) -> str:
    """
    List all detected patterns for a specific date.
    
    Args:
        conn: Database connection (injected via Depends)
        analysis_date: Date in YYYY-MM-DD format
        pattern_type: Optional filter by pattern type (e.g., 'doji', 'hammer')
    
    Returns:
        JSON string with pattern list
    """
    # Filter in SQL for better performance
    query = """
        SELECT 
            st.symbol,
            a.analysis_date,
            a.is_bullish,
            a.detected_patterns
        FROM analysis_stock_candlestick_pattern a
        JOIN stock_tickers st ON a.stock_ticker_id = st.id
        WHERE a.analysis_date = $1::date
          AND jsonb_array_length(a.detected_patterns) > 0
          AND ($2::text IS NULL OR 
               EXISTS(SELECT 1 FROM jsonb_array_elements(a.detected_patterns) p 
                      WHERE LOWER(p->>'pattern') = LOWER($2)))
        ORDER BY st.symbol
    """
    
    # Convert string date to date object for asyncpg
    analysis_date_obj = date.fromisoformat(analysis_date)
    
    try:
        rows = await asyncio.wait_for(
            conn.fetch(query, analysis_date_obj, pattern_type),
            timeout=QUERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "date": analysis_date,
            "message": f"Query took longer than {QUERY_TIMEOUT}s"
        })
    
    results = []
    for row in rows:
        patterns = json.loads(row["detected_patterns"]) if row["detected_patterns"] else []
        
        # If pattern_type specified, filter the patterns list (SQL already filtered rows)
        if pattern_type:
            patterns = [p for p in patterns if p.get("pattern", "").lower() == pattern_type.lower()]
        
        results.append({
            "symbol": row["symbol"],
            "is_bullish": row["is_bullish"],
            "patterns": patterns
        })
    
    return json.dumps({
        "date": analysis_date,
        "pattern_filter": pattern_type,
        "stocks_with_patterns": len(results),
        "results": results
    })


async def get_bullish_stocks(conn, analysis_date: str) -> str:
    """
    Get stocks with bullish patterns for a specific date.
    
    Args:
        conn: Database connection (injected via Depends)
        analysis_date: Date in YYYY-MM-DD format
    
    Returns:
        JSON string with bullish stocks
    """
    query = """
        SELECT 
            st.symbol,
            st.name,
            a.daily_close,
            a.body_size,
            a.detected_patterns
        FROM analysis_stock_candlestick_pattern a
        JOIN stock_tickers st ON a.stock_ticker_id = st.id
        WHERE a.analysis_date = $1::date
          AND a.is_bullish = true
        ORDER BY a.body_size DESC NULLS LAST
    """
    
    # Convert string date to date object for asyncpg
    analysis_date_obj = date.fromisoformat(analysis_date)
    
    try:
        rows = await asyncio.wait_for(
            conn.fetch(query, analysis_date_obj),
            timeout=QUERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "date": analysis_date,
            "message": f"Query took longer than {QUERY_TIMEOUT}s"
        })
    
    results = []
    for row in rows:
        patterns = json.loads(row["detected_patterns"]) if row["detected_patterns"] else []
        bullish_patterns = [
            p for p in patterns
            if p.get("signal", "").startswith("bullish") or p.get("signal") == "strong_bullish"
        ]
        
        results.append({
            "symbol": row["symbol"],
            "name": row["name"],
            "close_price": float(row["daily_close"]) if row["daily_close"] else None,
            "body_size": float(row["body_size"]) if row["body_size"] else None,
            "bullish_patterns": bullish_patterns,
            "all_patterns": patterns
        })
    
    return json.dumps({
        "date": analysis_date,
        "signal": "bullish",
        "total_bullish_stocks": len(results),
        "results": results
    })


async def get_bearish_stocks(conn, analysis_date: str) -> str:
    """
    Get stocks with bearish patterns for a specific date.
    
    Args:
        conn: Database connection (injected via Depends)
        analysis_date: Date in YYYY-MM-DD format
    
    Returns:
        JSON string with bearish stocks
    """
    query = """
        SELECT 
            st.symbol,
            st.name,
            a.daily_close,
            a.body_size,
            a.detected_patterns
        FROM analysis_stock_candlestick_pattern a
        JOIN stock_tickers st ON a.stock_ticker_id = st.id
        WHERE a.analysis_date = $1::date
          AND a.is_bullish = false
        ORDER BY a.body_size DESC NULLS LAST
    """
    
    # Convert string date to date object for asyncpg
    analysis_date_obj = date.fromisoformat(analysis_date)
    
    try:
        rows = await asyncio.wait_for(
            conn.fetch(query, analysis_date_obj),
            timeout=QUERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "date": analysis_date,
            "message": f"Query took longer than {QUERY_TIMEOUT}s"
        })
    
    results = []
    for row in rows:
        patterns = json.loads(row["detected_patterns"]) if row["detected_patterns"] else []
        bearish_patterns = [
            p for p in patterns
            if p.get("signal", "").startswith("bearish") or p.get("signal") == "strong_bearish"
        ]
        
        results.append({
            "symbol": row["symbol"],
            "name": row["name"],
            "close_price": float(row["daily_close"]) if row["daily_close"] else None,
            "body_size": float(row["body_size"]) if row["body_size"] else None,
            "bearish_patterns": bearish_patterns,
            "all_patterns": patterns
        })
    
    return json.dumps({
        "date": analysis_date,
        "signal": "bearish",
        "total_bearish_stocks": len(results),
        "results": results
    })


async def get_pattern_statistics(conn, days: int = 7) -> str:
    """
    Get aggregate statistics for candlestick patterns over the last N days.
    
    Args:
        conn: Database connection (injected via Depends)
        days: Number of days to analyze (default: 7)
    
    Returns:
        JSON string with pattern statistics
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    daily_query = """
        SELECT 
            a.analysis_date,
            COUNT(*) as total_stocks,
            COUNT(*) FILTER (WHERE a.is_bullish = true) as bullish_count,
            COUNT(*) FILTER (WHERE a.is_bullish = false) as bearish_count,
            COUNT(*) FILTER (WHERE jsonb_array_length(a.detected_patterns) > 0) as stocks_with_patterns
        FROM analysis_stock_candlestick_pattern a
        WHERE a.analysis_date >= $1::date
          AND a.analysis_date <= $2::date
        GROUP BY a.analysis_date
        ORDER BY a.analysis_date DESC
    """
    
    pattern_query = """
        SELECT 
            p->>'pattern' as pattern_name,
            COUNT(*) as occurrence_count
        FROM analysis_stock_candlestick_pattern a,
             jsonb_array_elements(a.detected_patterns) as p
        WHERE a.analysis_date >= $1::date
          AND a.analysis_date <= $2::date
        GROUP BY p->>'pattern'
        ORDER BY occurrence_count DESC
        LIMIT 10
    """
    
    try:
        # Run both queries in parallel using asyncio.gather
        daily_stats, pattern_stats = await asyncio.wait_for(
            asyncio.gather(
                conn.fetch(daily_query, start_date, end_date),
                conn.fetch(pattern_query, start_date, end_date)
            ),
            timeout=QUERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "days": days,
            "message": f"Query took longer than {QUERY_TIMEOUT}s"
        })
    
    daily_results = []
    total_bullish = 0
    total_bearish = 0
    
    for row in daily_stats:
        total_bullish += row["bullish_count"]
        total_bearish += row["bearish_count"]
        daily_results.append({
            "date": str(row["analysis_date"]),
            "total_stocks": row["total_stocks"],
            "bullish_count": row["bullish_count"],
            "bearish_count": row["bearish_count"],
            "stocks_with_patterns": row["stocks_with_patterns"],
            "bullish_ratio": round(row["bullish_count"] / row["total_stocks"] * 100, 1) if row["total_stocks"] > 0 else 0
        })
    
    pattern_results = [
        {"pattern": row["pattern_name"], "count": row["occurrence_count"]}
        for row in pattern_stats
    ]
    
    total = total_bullish + total_bearish
    overall_bullish_ratio = round(total_bullish / total * 100, 1) if total > 0 else 0
    
    return json.dumps({
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
            "days": days
        },
        "summary": {
            "total_bullish": total_bullish,
            "total_bearish": total_bearish,
            "overall_bullish_ratio": overall_bullish_ratio,
            "overall_bearish_ratio": round(100 - overall_bullish_ratio, 1)
        },
        "most_common_patterns": pattern_results,
        "daily_breakdown": daily_results
    })
