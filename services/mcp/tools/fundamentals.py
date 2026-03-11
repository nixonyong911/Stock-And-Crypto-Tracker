"""Fundamental analysis tools: peer comparison."""

import asyncio
import json
from typing import List

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


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
            f.debt_to_equity, f.market_cap, f.dividend_yield,
            f.beta, f.dividend_per_share
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
                "beta": _float(row["beta"]),
                "dividend_per_share": _float(row["dividend_per_share"]),
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
