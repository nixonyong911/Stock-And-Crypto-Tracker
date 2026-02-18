"""Fundamental analysis tools: trend trajectory and peer comparison."""

import asyncio
import json
from typing import List

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


def _int(val) -> int | None:
    return int(val) if val is not None else None


async def get_fundamentals_trend(
    conn,
    symbol: str,
    quarters: int = 4,
) -> str:
    """
    Get quarter-over-quarter fundamentals trajectory with computed deltas
    and integrated earnings surprise data.

    Args:
        conn: Database connection
        symbol: Stock ticker symbol
        quarters: Number of quarters to return (1-12)

    Returns:
        JSON with quarterly metrics, QoQ changes, earnings surprises, and trajectory summary
    """
    fundamentals_query = """
        SELECT
            st.symbol,
            f.fiscal_year, f.fiscal_quarter,
            f.market_cap, f.pe_ratio, f.forward_pe, f.peg_ratio, f.fcf_yield,
            f.roe, f.roic, f.operating_margin,
            f.revenue_ttm, f.revenue_growth_yoy,
            f.eps_ttm, f.eps_growth_yoy,
            f.debt_to_equity, f.interest_coverage,
            f.free_cash_flow, f.fcf_growth_yoy,
            f.dividend_yield
        FROM analysis_stock_fundamentals f
        JOIN stock_tickers st ON f.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
        ORDER BY f.fiscal_year DESC, f.fiscal_quarter DESC
        LIMIT $2
    """

    earnings_query = """
        SELECT
            e.fiscal_year, e.fiscal_quarter,
            e.eps_estimate, e.eps_actual, e.eps_surprise, e.eps_surprise_percent,
            e.revenue_estimate, e.revenue_actual
        FROM analysis_earnings_release_schedule e
        JOIN stock_tickers st ON e.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) = UPPER($1)
          AND e.eps_actual IS NOT NULL
        ORDER BY e.fiscal_year DESC, e.fiscal_quarter DESC
        LIMIT $2
    """

    try:
        fund_rows = await _safe_fetch(conn, fundamentals_query, symbol, quarters)
        earn_rows = await _safe_fetch(conn, earnings_query, symbol, quarters)
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "symbol": symbol.upper(),
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not fund_rows:
        return json.dumps({
            "symbol": symbol.upper(),
            "message": f"No fundamental data found for {symbol.upper()}",
            "quarters": [],
        })

    # Build earnings lookup by fiscal period
    earnings_map: dict[str, dict] = {}
    for er in earn_rows:
        key = f"{er['fiscal_year']}-{er['fiscal_quarter']}"
        rev_est = _float(er["revenue_estimate"])
        rev_act = _float(er["revenue_actual"])
        rev_surprise_pct = None
        if rev_est and rev_act and rev_est != 0:
            rev_surprise_pct = round((rev_act - rev_est) / abs(rev_est) * 100, 2)
        earnings_map[key] = {
            "eps_surprise_pct": _float(er["eps_surprise_percent"]),
            "revenue_surprise_pct": rev_surprise_pct,
        }

    # Process quarters in chronological order (reverse the DESC order)
    fund_rows_chrono = list(reversed(fund_rows))

    quarter_results = []
    prev_metrics: dict | None = None

    for row in fund_rows_chrono:
        period = f"Q{row['fiscal_quarter']} {row['fiscal_year']}"
        fiscal_key = f"{row['fiscal_year']}-{row['fiscal_quarter']}"

        metrics = {
            "revenue_growth_yoy": _float(row["revenue_growth_yoy"]),
            "eps_growth_yoy": _float(row["eps_growth_yoy"]),
            "roe": _float(row["roe"]),
            "operating_margin": _float(row["operating_margin"]),
        }

        qoq_change: dict[str, str | None] = {}
        if prev_metrics:
            for key in metrics:
                curr = metrics[key]
                prev = prev_metrics[key]
                if curr is not None and prev is not None:
                    diff = round(curr - prev, 4)
                    qoq_change[key] = f"+{diff}" if diff >= 0 else str(diff)
                else:
                    qoq_change[key] = None

        quarter_results.append({
            "period": period,
            "valuation": {
                "pe_ratio": _float(row["pe_ratio"]),
                "forward_pe": _float(row["forward_pe"]),
                "peg_ratio": _float(row["peg_ratio"]),
                "fcf_yield": _float(row["fcf_yield"]),
                "market_cap": _float(row["market_cap"]),
            },
            "growth": {
                "revenue_ttm": _float(row["revenue_ttm"]),
                "revenue_growth_yoy": _float(row["revenue_growth_yoy"]),
                "eps_ttm": _float(row["eps_ttm"]),
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
                "free_cash_flow": _float(row["free_cash_flow"]),
                "fcf_growth_yoy": _float(row["fcf_growth_yoy"]),
                "dividend_yield": _float(row["dividend_yield"]),
            },
            "qoq_change": qoq_change if qoq_change else None,
            "earnings_surprise": earnings_map.get(fiscal_key),
        })

        prev_metrics = metrics

    # Compute trajectory summary
    def _direction(values: list[float | None]) -> str:
        nums = [v for v in values if v is not None]
        if len(nums) < 2:
            return "insufficient_data"
        diffs = [nums[i] - nums[i - 1] for i in range(1, len(nums))]
        if all(d > 0 for d in diffs):
            return "accelerating"
        if all(d < 0 for d in diffs):
            return "decelerating"
        if all(d >= 0 for d in diffs):
            return "stable_improving"
        if all(d <= 0 for d in diffs):
            return "stable_declining"
        return "mixed"

    rev_growth_vals = [
        _float(r["revenue_growth_yoy"]) for r in fund_rows_chrono
    ]
    eps_growth_vals = [
        _float(r["eps_growth_yoy"]) for r in fund_rows_chrono
    ]
    margin_vals = [
        _float(r["operating_margin"]) for r in fund_rows_chrono
    ]
    leverage_vals = [
        _float(r["debt_to_equity"]) for r in fund_rows_chrono
    ]

    # Beat streak from earnings
    beat_streak = 0
    for er in earn_rows:  # Already in DESC order
        surprise = _float(er["eps_surprise_percent"])
        if surprise is not None and surprise > 0:
            beat_streak += 1
        else:
            break

    return json.dumps({
        "symbol": symbol.upper(),
        "quarters_shown": len(quarter_results),
        "quarters": quarter_results,
        "trajectory": {
            "revenue_growth": _direction(rev_growth_vals),
            "eps_growth": _direction(eps_growth_vals),
            "margins": _direction(margin_vals),
            "leverage": _direction(leverage_vals),
            "earnings_beat_streak": beat_streak,
        },
    })


async def compare_stocks(
    conn,
    symbols: List[str],
) -> str:
    """
    Side-by-side peer comparison with per-metric ranking.

    Args:
        conn: Database connection
        symbols: List of 2-10 ticker symbols

    Returns:
        JSON with per-stock fundamentals + technicals, rankings, and best-in-class
    """
    placeholders = ", ".join(f"UPPER(${i+1})" for i in range(len(symbols)))

    fundamentals_query = f"""
        SELECT DISTINCT ON (st.symbol)
            st.symbol,
            f.pe_ratio, f.forward_pe, f.peg_ratio, f.fcf_yield,
            f.roe, f.roic, f.operating_margin,
            f.revenue_growth_yoy, f.eps_growth_yoy,
            f.debt_to_equity, f.market_cap, f.dividend_yield
        FROM analysis_stock_fundamentals f
        JOIN stock_tickers st ON f.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) IN ({placeholders})
        ORDER BY st.symbol, f.fiscal_year DESC, f.fiscal_quarter DESC
    """

    indicators_query = f"""
        SELECT DISTINCT ON (st.symbol)
            st.symbol,
            i.rsi, i.macd_histogram
        FROM analysis_stock_indicator i
        JOIN stock_tickers st ON i.stock_ticker_id = st.id
        WHERE UPPER(st.symbol) IN ({placeholders})
        ORDER BY st.symbol, i.indicator_time DESC
    """

    try:
        fund_rows = await _safe_fetch(conn, fundamentals_query, *symbols)
        ind_rows = await _safe_fetch(conn, indicators_query, *symbols)
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not fund_rows:
        return json.dumps({
            "message": "No fundamental data found for the requested symbols",
            "symbols": [s.upper() for s in symbols],
            "stocks": [],
        })

    ind_map: dict[str, dict] = {}
    for ir in ind_rows:
        ind_map[ir["symbol"]] = {
            "rsi": _float(ir["rsi"]),
            "macd_histogram": _float(ir["macd_histogram"]),
        }

    stocks = []
    for row in fund_rows:
        sym = row["symbol"]
        tech = ind_map.get(sym, {"rsi": None, "macd_histogram": None})
        stocks.append({
            "symbol": sym,
            "fundamentals": {
                "pe_ratio": _float(row["pe_ratio"]),
                "forward_pe": _float(row["forward_pe"]),
                "peg_ratio": _float(row["peg_ratio"]),
                "fcf_yield": _float(row["fcf_yield"]),
                "roe": _float(row["roe"]),
                "roic": _float(row["roic"]),
                "operating_margin": _float(row["operating_margin"]),
                "revenue_growth_yoy": _float(row["revenue_growth_yoy"]),
                "eps_growth_yoy": _float(row["eps_growth_yoy"]),
                "debt_to_equity": _float(row["debt_to_equity"]),
                "market_cap": _float(row["market_cap"]),
                "dividend_yield": _float(row["dividend_yield"]),
            },
            "technicals": tech,
        })

    # Compute rankings: lower rank = better.
    # "higher is better" metrics vs "lower is better" metrics.
    higher_better = {
        "roe", "roic", "operating_margin", "revenue_growth_yoy",
        "eps_growth_yoy", "fcf_yield", "dividend_yield",
    }
    lower_better = {"pe_ratio", "forward_pe", "peg_ratio", "debt_to_equity"}

    for metric in higher_better | lower_better:
        reverse = metric in higher_better
        vals = []
        for s in stocks:
            v = s["fundamentals"].get(metric)
            vals.append((s["symbol"], v))

        # Sort: None values go to the end
        sortable = [(sym, v) for sym, v in vals if v is not None]
        unsortable = [(sym, v) for sym, v in vals if v is None]
        sortable.sort(key=lambda x: x[1], reverse=reverse)

        rank_map = {}
        for rank, (sym, _) in enumerate(sortable, start=1):
            rank_map[sym] = rank
        for sym, _ in unsortable:
            rank_map[sym] = None

        for s in stocks:
            s.setdefault("ranks", {})[metric] = rank_map.get(s["symbol"])

    # Best in class
    best: dict[str, str | None] = {}
    for metric in ["pe_ratio", "roe", "revenue_growth_yoy", "peg_ratio", "fcf_yield"]:
        reverse = metric in higher_better
        candidates = [
            (s["symbol"], s["fundamentals"][metric])
            for s in stocks if s["fundamentals"].get(metric) is not None
        ]
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=reverse)
            label_map = {
                "pe_ratio": "cheapest_pe",
                "roe": "highest_profitability",
                "revenue_growth_yoy": "best_growth",
                "peg_ratio": "best_value_for_growth",
                "fcf_yield": "best_cash_flow_yield",
            }
            best[label_map[metric]] = candidates[0][0]

    return json.dumps({
        "compared_stocks": len(stocks),
        "stocks": stocks,
        "best_in_class": best,
    })
