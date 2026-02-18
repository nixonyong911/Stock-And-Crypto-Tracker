"""Macro-economic environment tool: regime classification, indicators, and upcoming catalysts."""

import asyncio
import json

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


async def get_macro_environment(
    conn,
    category: str | None = None,
) -> str:
    """
    Get the current macro-economic environment with regime classification,
    indicator details, and upcoming data release catalysts.

    Joins analysis_economic_indicators with analysis_release_calendar.

    Args:
        conn: Database connection
        category: Optional filter (e.g. 'inflation', 'employment', 'growth')

    Returns:
        JSON with regime summary, indicator details, and upcoming catalysts
    """
    query = """
        SELECT
            ei.series_id,
            ei.display_name,
            ei.category,
            ei.current_value,
            ei.current_observation_date,
            ei.previous_value,
            ei.previous_observation_date,
            ei.change_value,
            ei.change_percent,
            ei.trend,
            ei.current_signal,
            ei.bullish_when,
            ei.units,
            ei.description,
            COALESCE(ei.display_mode, 'rate') AS display_mode,
            ei.media_current_value,
            ei.media_previous_value,
            ei.last_release_date,
            rc.release_name,
            rc.next_release_date,
            rc.following_release_date,
            rc.release_frequency
        FROM analysis_economic_indicators ei
        LEFT JOIN analysis_release_calendar rc ON ei.series_id = rc.series_id
        WHERE ei.is_active = true
          AND ($1::text IS NULL OR LOWER(ei.category) = LOWER($1))
        ORDER BY ei.category, ei.display_order
    """

    try:
        rows = await _safe_fetch(conn, query, category)
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    if not rows:
        return json.dumps({
            "message": "No active economic indicators found"
            + (f" for category '{category}'" if category else ""),
            "indicators": [],
        })

    bullish_count = 0
    bearish_count = 0
    neutral_count = 0
    indicators = []
    upcoming_catalysts = []

    from datetime import date as date_type, timedelta

    catalyst_cutoff = date_type.today() + timedelta(days=14)

    for row in rows:
        signal = row["current_signal"]
        if signal == "bullish":
            bullish_count += 1
        elif signal == "bearish":
            bearish_count += 1
        else:
            neutral_count += 1

        next_release = row["next_release_date"]
        next_release_str = str(next_release) if next_release else None

        indicators.append({
            "series_id": row["series_id"],
            "name": row["display_name"],
            "category": row["category"],
            "current_value": _float(row["current_value"]),
            "previous_value": _float(row["previous_value"]),
            "units": row["units"],
            "change_percent": _float(row["change_percent"]),
            "trend": row["trend"],
            "signal": signal,
            "bullish_when": row["bullish_when"],
            "next_release_date": next_release_str,
        })

        if next_release and next_release <= catalyst_cutoff:
            upcoming_catalysts.append({
                "release_name": row["release_name"] or row["display_name"],
                "date": str(next_release),
                "current_signal": signal,
                "current_trend": row["trend"],
                "frequency": row["release_frequency"],
            })

    upcoming_catalysts.sort(key=lambda x: x["date"])

    total = bullish_count + bearish_count + neutral_count
    if total == 0:
        classification = "no_data"
    elif bullish_count > bearish_count * 1.5:
        classification = "risk-on"
    elif bearish_count > bullish_count * 1.5:
        classification = "risk-off"
    else:
        classification = "mixed"

    return json.dumps({
        "regime": {
            "classification": classification,
            "bullish_count": bullish_count,
            "bearish_count": bearish_count,
            "neutral_count": neutral_count,
        },
        "indicators": indicators,
        "upcoming_catalysts": upcoming_catalysts,
    })
