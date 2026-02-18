"""Earnings analysis tools: history with beat streaks and market-wide earnings calendar."""

import asyncio
import json
from datetime import date, timedelta

from .analysis import _safe_fetch, _safe_gather, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


async def get_earnings_history(
    conn,
    symbol: str,
    quarters: int = 4,
) -> str:
    """
    Get earnings history for a stock with EPS and revenue surprises, beat streaks,
    and upcoming earnings info.

    Args:
        conn: Database connection
        symbol: Stock ticker symbol
        quarters: Number of past quarters to return (1-12)

    Returns:
        JSON with earnings history, track record summary, and next earnings date
    """
    history_query = """
        SELECT
            st.symbol,
            e.fiscal_year, e.fiscal_quarter, e.earnings_date,
            e.eps_estimate, e.eps_actual, e.eps_surprise, e.eps_surprise_percent,
            e.revenue_estimate, e.revenue_actual
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
          AND e.eps_actual IS NOT NULL
        ORDER BY e.fiscal_year DESC, e.fiscal_quarter DESC
        LIMIT $2
    """

    upcoming_query = """
        SELECT
            e.earnings_date, e.fiscal_year, e.fiscal_quarter,
            e.eps_estimate, e.revenue_estimate
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
          AND e.earnings_date >= CURRENT_DATE
          AND e.eps_actual IS NULL
        ORDER BY e.earnings_date ASC
        LIMIT 1
    """

    try:
        hist_rows, upcoming_rows = await _safe_gather(
            conn,
            [
                (history_query, symbol, quarters),
                (upcoming_query, symbol),
            ],
            timeout=QUERY_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "symbol": symbol.upper(),
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not hist_rows and not upcoming_rows:
        return json.dumps({
            "symbol": symbol.upper(),
            "message": f"No earnings data found for {symbol.upper()}",
            "history": [],
        })

    # Next earnings
    next_earnings = None
    if upcoming_rows:
        ur = upcoming_rows[0]
        next_earnings = {
            "date": str(ur["earnings_date"]) if ur["earnings_date"] else None,
            "period": f"Q{ur['fiscal_quarter']} {ur['fiscal_year']}",
            "eps_estimate": _float(ur["eps_estimate"]),
            "revenue_estimate": _float(ur["revenue_estimate"]),
        }

    # History (chronological for display)
    history = []
    eps_beats = 0
    eps_misses = 0
    total_eps_surprise = 0.0
    revenue_beats = 0
    revenue_misses = 0
    total_revenue_surprise = 0.0
    revenue_surprise_count = 0

    for row in reversed(hist_rows):
        eps_est = _float(row["eps_estimate"])
        eps_act = _float(row["eps_actual"])
        eps_surprise_pct = _float(row["eps_surprise_percent"])
        rev_est = _float(row["revenue_estimate"])
        rev_act = _float(row["revenue_actual"])

        rev_surprise_pct = None
        if rev_est and rev_act and rev_est != 0:
            rev_surprise_pct = round((rev_act - rev_est) / abs(rev_est) * 100, 2)

        if eps_surprise_pct is not None:
            if eps_surprise_pct > 0:
                eps_beats += 1
            else:
                eps_misses += 1
            total_eps_surprise += eps_surprise_pct

        if rev_surprise_pct is not None:
            revenue_surprise_count += 1
            if rev_surprise_pct > 0:
                revenue_beats += 1
            else:
                revenue_misses += 1
            total_revenue_surprise += rev_surprise_pct

        history.append({
            "period": f"Q{row['fiscal_quarter']} {row['fiscal_year']}",
            "date": str(row["earnings_date"]) if row["earnings_date"] else None,
            "eps": {
                "estimate": eps_est,
                "actual": eps_act,
                "surprise_pct": eps_surprise_pct,
            },
            "revenue": {
                "estimate": rev_est,
                "actual": rev_act,
                "surprise_pct": rev_surprise_pct,
            },
        })

    # Beat streak: consecutive positive EPS surprises from most recent
    beat_streak = 0
    for row in hist_rows:  # DESC order = most recent first
        surprise = _float(row["eps_surprise_percent"])
        if surprise is not None and surprise > 0:
            beat_streak += 1
        else:
            break

    eps_total = eps_beats + eps_misses
    avg_eps_surprise = round(total_eps_surprise / eps_total, 2) if eps_total > 0 else None
    avg_revenue_surprise = (
        round(total_revenue_surprise / revenue_surprise_count, 2)
        if revenue_surprise_count > 0
        else None
    )

    return json.dumps({
        "symbol": symbol.upper(),
        "next_earnings": next_earnings,
        "history": history,
        "track_record": {
            "eps_beat_streak": beat_streak,
            "eps_beats": eps_beats,
            "eps_misses": eps_misses,
            "avg_eps_surprise_pct": avg_eps_surprise,
            "revenue_beats": revenue_beats,
            "revenue_misses": revenue_misses,
            "avg_revenue_surprise_pct": avg_revenue_surprise,
        },
    })


async def get_market_earnings(
    conn,
    days_ahead: int = 7,
    days_back: int = 14,
    min_surprise_pct: float | None = None,
) -> str:
    """
    Market-wide earnings dashboard: upcoming reporters and recent surprises.

    Args:
        conn: Database connection
        days_ahead: Days into the future for upcoming earnings (1-30)
        days_back: Days into the past for recent surprises (1-90)
        min_surprise_pct: Minimum abs(surprise %) to include (filters noise)

    Returns:
        JSON with upcoming earnings and recent biggest beats/misses
    """
    upcoming_query = """
        SELECT
            st.symbol, st.name,
            e.earnings_date, e.fiscal_year, e.fiscal_quarter,
            e.eps_estimate, e.revenue_estimate
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE e.earnings_date >= CURRENT_DATE
          AND e.earnings_date <= CURRENT_DATE + $1
          AND e.eps_actual IS NULL
        ORDER BY e.earnings_date ASC, st.symbol
    """

    surprises_query = """
        SELECT
            st.symbol, st.name,
            e.earnings_date, e.fiscal_year, e.fiscal_quarter,
            e.eps_estimate, e.eps_actual, e.eps_surprise_percent,
            e.revenue_estimate, e.revenue_actual
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE e.eps_actual IS NOT NULL
          AND e.earnings_date >= CURRENT_DATE - $1
          AND e.earnings_date <= CURRENT_DATE
        ORDER BY ABS(e.eps_surprise_percent) DESC NULLS LAST
    """

    try:
        upcoming_rows, surprise_rows = await _safe_gather(
            conn,
            [
                (upcoming_query, days_ahead),
                (surprises_query, days_back),
            ],
            timeout=QUERY_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    upcoming = []
    for row in upcoming_rows:
        upcoming.append({
            "symbol": row["symbol"],
            "name": row["name"],
            "date": str(row["earnings_date"]) if row["earnings_date"] else None,
            "period": f"Q{row['fiscal_quarter']} {row['fiscal_year']}",
            "eps_estimate": _float(row["eps_estimate"]),
            "revenue_estimate": _float(row["revenue_estimate"]),
        })

    biggest_beats = []
    biggest_misses = []
    for row in surprise_rows:
        eps_surprise_pct = _float(row["eps_surprise_percent"])
        if eps_surprise_pct is None:
            continue

        if min_surprise_pct is not None and abs(eps_surprise_pct) < min_surprise_pct:
            continue

        rev_est = _float(row["revenue_estimate"])
        rev_act = _float(row["revenue_actual"])
        rev_surprise_pct = None
        if rev_est and rev_act and rev_est != 0:
            rev_surprise_pct = round((rev_act - rev_est) / abs(rev_est) * 100, 2)

        entry = {
            "symbol": row["symbol"],
            "name": row["name"],
            "date": str(row["earnings_date"]) if row["earnings_date"] else None,
            "eps_surprise_pct": eps_surprise_pct,
            "revenue_surprise_pct": rev_surprise_pct,
        }

        if eps_surprise_pct > 0:
            biggest_beats.append(entry)
        else:
            biggest_misses.append(entry)

    return json.dumps({
        "upcoming": {
            "count": len(upcoming),
            "days_ahead": days_ahead,
            "stocks": upcoming,
        },
        "recent_surprises": {
            "days_back": days_back,
            "min_surprise_pct": min_surprise_pct,
            "biggest_beats": biggest_beats,
            "biggest_misses": biggest_misses,
        },
    })
