"""Cross-domain stock screener: filter across technicals, fundamentals, patterns, and earnings."""

import asyncio
import json
from datetime import date

import asyncpg

from .analysis import QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


async def screen_stocks(
    conn,
    rsi_above: float | None = None,
    rsi_below: float | None = None,
    macd_signal: str | None = None,
    max_pe: float | None = None,
    min_roe: float | None = None,
    min_revenue_growth: float | None = None,
    max_debt_to_equity: float | None = None,
    min_operating_margin: float | None = None,
    min_fcf_yield: float | None = None,
    max_peg_ratio: float | None = None,
    pattern_signal: str | None = None,
    earnings_within_days: int | None = None,
    limit: int = 20,
    sort_by: str | None = None,
) -> str:
    """
    Multi-signal cross-domain stock screener.

    Dynamically builds SQL with JOINs only for tables referenced by active filters.
    At least one filter must be provided.

    Args:
        conn: Database connection
        rsi_above/rsi_below: RSI thresholds
        macd_signal: 'bullish' or 'bearish' (histogram sign)
        max_pe/min_roe/...: Fundamental filters
        pattern_signal: 'bullish' or 'bearish' (candlestick)
        earnings_within_days: Stocks with upcoming earnings within N days
        limit: Max results (1-50)
        sort_by: Optional sort metric

    Returns:
        JSON with matched stocks and the data that matched
    """
    has_tech = rsi_above is not None or rsi_below is not None or macd_signal is not None
    has_fund = any(v is not None for v in [
        max_pe, min_roe, min_revenue_growth, max_debt_to_equity,
        min_operating_margin, min_fcf_yield, max_peg_ratio,
    ])
    has_pattern = pattern_signal is not None
    has_earnings = earnings_within_days is not None

    if not (has_tech or has_fund or has_pattern or has_earnings):
        return json.dumps({
            "error": "no_filters",
            "message": "At least one filter is required.",
        })

    filters_applied = []
    select_parts = ["st.symbol", "st.name"]
    from_parts = ["stock_tickers st"]
    where_parts = []
    params: list = []
    param_idx = 0

    def _next_param(val):
        nonlocal param_idx
        param_idx += 1
        params.append(val)
        return f"${param_idx}"

    # --- Technical indicators (latest per stock) ---
    if has_tech:
        from_parts.append("""
            LATERAL (
                SELECT i.rsi, i.macd_histogram
                FROM analysis_stock_indicator i
                WHERE i.stock_ticker_id = st.id
                ORDER BY i.indicator_time DESC
                LIMIT 1
            ) tech ON true""")
        select_parts.extend(["tech.rsi", "tech.macd_histogram"])

        if rsi_above is not None:
            p = _next_param(rsi_above)
            where_parts.append(f"tech.rsi >= {p}")
            filters_applied.append(f"rsi_above: {rsi_above}")
        if rsi_below is not None:
            p = _next_param(rsi_below)
            where_parts.append(f"tech.rsi <= {p}")
            filters_applied.append(f"rsi_below: {rsi_below}")
        if macd_signal == "bullish":
            where_parts.append("tech.macd_histogram > 0")
            filters_applied.append("macd_signal: bullish")
        elif macd_signal == "bearish":
            where_parts.append("tech.macd_histogram < 0")
            filters_applied.append("macd_signal: bearish")

    # --- Fundamentals (latest quarter per stock) ---
    if has_fund:
        from_parts.append("""
            LATERAL (
                SELECT f.pe_ratio, f.roe, f.revenue_growth_yoy, f.debt_to_equity,
                       f.operating_margin, f.fcf_yield, f.peg_ratio, f.market_cap
                FROM analysis_stock_fundamentals f
                WHERE f.stock_ticker_id = st.id
                ORDER BY f.fiscal_year DESC, f.fiscal_quarter DESC
                LIMIT 1
            ) fund ON true""")
        select_parts.extend([
            "fund.pe_ratio", "fund.roe", "fund.revenue_growth_yoy",
            "fund.debt_to_equity", "fund.operating_margin", "fund.fcf_yield",
            "fund.peg_ratio", "fund.market_cap",
        ])

        if max_pe is not None:
            p = _next_param(max_pe)
            where_parts.append(f"fund.pe_ratio <= {p}")
            filters_applied.append(f"max_pe: {max_pe}")
        if min_roe is not None:
            p = _next_param(min_roe)
            where_parts.append(f"fund.roe >= {p}")
            filters_applied.append(f"min_roe: {min_roe}")
        if min_revenue_growth is not None:
            p = _next_param(min_revenue_growth)
            where_parts.append(f"fund.revenue_growth_yoy >= {p}")
            filters_applied.append(f"min_revenue_growth: {min_revenue_growth}")
        if max_debt_to_equity is not None:
            p = _next_param(max_debt_to_equity)
            where_parts.append(f"fund.debt_to_equity <= {p}")
            filters_applied.append(f"max_debt_to_equity: {max_debt_to_equity}")
        if min_operating_margin is not None:
            p = _next_param(min_operating_margin)
            where_parts.append(f"fund.operating_margin >= {p}")
            filters_applied.append(f"min_operating_margin: {min_operating_margin}")
        if min_fcf_yield is not None:
            p = _next_param(min_fcf_yield)
            where_parts.append(f"fund.fcf_yield >= {p}")
            filters_applied.append(f"min_fcf_yield: {min_fcf_yield}")
        if max_peg_ratio is not None:
            p = _next_param(max_peg_ratio)
            where_parts.append(f"fund.peg_ratio <= {p}")
            filters_applied.append(f"max_peg_ratio: {max_peg_ratio}")

    # --- Candlestick pattern signal (today) ---
    if has_pattern:
        from_parts.append("""
            LATERAL (
                SELECT c.is_bullish, c.detected_patterns
                FROM analysis_stock_candlestick_pattern c
                WHERE c.stock_ticker_id = st.id
                ORDER BY c.analysis_date DESC
                LIMIT 1
            ) candle ON true""")
        select_parts.extend(["candle.is_bullish", "candle.detected_patterns"])

        if pattern_signal == "bullish":
            where_parts.append("candle.is_bullish = true")
            filters_applied.append("pattern_signal: bullish")
        elif pattern_signal == "bearish":
            where_parts.append("candle.is_bullish = false")
            filters_applied.append("pattern_signal: bearish")

    # --- Upcoming earnings within N days ---
    if has_earnings:
        p = _next_param(earnings_within_days)
        from_parts.append(f"""
            JOIN LATERAL (
                SELECT e.earnings_date, e.eps_estimate
                FROM analysis_earnings_release_schedule e
                WHERE e.stock_ticker_id = st.id
                  AND e.earnings_date >= CURRENT_DATE
                  AND e.earnings_date <= CURRENT_DATE + {p}
                  AND e.eps_actual IS NULL
                ORDER BY e.earnings_date ASC
                LIMIT 1
            ) earn ON true""")
        select_parts.extend(["earn.earnings_date", "earn.eps_estimate"])
        filters_applied.append(f"earnings_within_days: {earnings_within_days}")

    # --- Build final query ---
    limit_param = _next_param(min(limit, 50))

    # Determine ORDER BY
    order_clause = "st.symbol"
    valid_sort_cols = {
        "pe_ratio": "fund.pe_ratio",
        "roe": "fund.roe",
        "revenue_growth_yoy": "fund.revenue_growth_yoy",
        "rsi": "tech.rsi",
        "market_cap": "fund.market_cap",
    }
    if sort_by and sort_by in valid_sort_cols:
        # Check the corresponding table is joined
        col = valid_sort_cols[sort_by]
        if (col.startswith("fund.") and has_fund) or (col.startswith("tech.") and has_tech):
            order_clause = f"{col} NULLS LAST"

    sql = (
        f"SELECT {', '.join(select_parts)} "
        f"FROM {' '.join(from_parts)} "
    )
    if where_parts:
        sql += f"WHERE {' AND '.join(where_parts)} "
    sql += f"ORDER BY {order_clause} LIMIT {limit_param}"

    timeout_ms = int(QUERY_TIMEOUT * 1000)
    try:
        await conn.execute(f"SET LOCAL statement_timeout = '{timeout_ms}'")
        rows = await conn.fetch(sql, *params)
    except asyncpg.QueryCanceledError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Screener query took longer than {QUERY_TIMEOUT}s",
        })
    except asyncpg.PostgresError as e:
        return json.dumps({
            "error": "query_error",
            "message": str(e),
        })

    results = []
    for row in rows:
        matched_data: dict = {}

        if has_tech:
            matched_data["rsi"] = _float(row.get("rsi"))
            matched_data["macd_histogram"] = _float(row.get("macd_histogram"))

        if has_fund:
            matched_data["pe_ratio"] = _float(row.get("pe_ratio"))
            matched_data["roe"] = _float(row.get("roe"))
            matched_data["revenue_growth_yoy"] = _float(row.get("revenue_growth_yoy"))
            matched_data["debt_to_equity"] = _float(row.get("debt_to_equity"))
            matched_data["operating_margin"] = _float(row.get("operating_margin"))
            matched_data["fcf_yield"] = _float(row.get("fcf_yield"))
            matched_data["peg_ratio"] = _float(row.get("peg_ratio"))
            matched_data["market_cap"] = _float(row.get("market_cap"))

        if has_pattern:
            patterns_raw = row.get("detected_patterns")
            detected = json.loads(patterns_raw) if patterns_raw else []
            matched_data["is_bullish"] = row.get("is_bullish")
            matched_data["detected_patterns"] = [
                p.get("pattern") for p in detected
            ] if detected else []

        if has_earnings:
            ed = row.get("earnings_date")
            matched_data["earnings_date"] = str(ed) if ed else None
            matched_data["eps_estimate"] = _float(row.get("eps_estimate"))

        results.append({
            "symbol": row["symbol"],
            "name": row["name"],
            "matched_data": matched_data,
        })

    return json.dumps({
        "filters_applied": filters_applied,
        "matches": len(results),
        "results": results,
    })
