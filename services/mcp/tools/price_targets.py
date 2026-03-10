"""Price target analysis: entry/target/stop-loss levels for stocks and crypto."""

import asyncio
import json

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


async def get_price_targets(
    conn,
    symbol: str,
    days: int = 1,
) -> str:
    """
    Get pre-computed price target analysis for a stock or crypto.

    Works for both stocks (e.g., 'AAPL') and crypto (e.g., 'BTC/USD').
    The analysis_ticker_price_targets table stores both asset types.

    Args:
        conn: Database connection
        symbol: Ticker symbol (stock or crypto)
        days: Number of recent days to return (1-30)

    Returns:
        JSON with entry price, target price, stop loss, signal summary,
        confidence, and metadata for each analysis date.
    """
    query = """
        SELECT
            analysis_date, asset_type, trader_type,
            latest_close, latest_open,
            entry_price, entry_price_low, entry_price_high,
            target_price, stop_loss,
            signal_summary, confidence, metadata
        FROM analysis_ticker_price_targets
        WHERE UPPER(ticker_symbol) = UPPER($1)
        ORDER BY analysis_date DESC
        LIMIT $2
    """

    try:
        rows = await _safe_fetch(conn, query, symbol, days)
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "symbol": symbol.upper(),
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not rows:
        return json.dumps({
            "symbol": symbol.upper(),
            "message": f"No price target data found for {symbol.upper()}",
            "targets": [],
        })

    targets = []
    for row in reversed(rows):
        meta = row["metadata"]
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except (json.JSONDecodeError, TypeError):
                meta = {}

        targets.append({
            "analysis_date": str(row["analysis_date"]),
            "asset_type": row["asset_type"],
            "trader_type": row["trader_type"],
            "latest_close": _float(row["latest_close"]),
            "entry_price": _float(row["entry_price"]),
            "entry_range": {
                "low": _float(row["entry_price_low"]),
                "high": _float(row["entry_price_high"]),
            },
            "target_price": _float(row["target_price"]),
            "stop_loss": _float(row["stop_loss"]),
            "signal_summary": row["signal_summary"],
            "confidence": _float(row["confidence"]),
            "metadata": meta if meta else {},
        })

    return json.dumps({
        "symbol": symbol.upper(),
        "days": days,
        "count": len(targets),
        "targets": targets,
    })
