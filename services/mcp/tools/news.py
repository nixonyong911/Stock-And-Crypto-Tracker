"""News sentiment analysis tool: market-moving news with entity-level sentiment from MarketAux."""

import asyncio
import json
from datetime import date, timedelta

from .analysis import _safe_fetch, QUERY_TIMEOUT


def _float(val) -> float | None:
    return float(val) if val is not None else None


async def get_news_sentiment(
    conn,
    ticker: str | None = None,
    days_back: int = 7,
    category: str | None = None,
    sentiment: str | None = None,
    limit: int = 20,
) -> str:
    """
    Get recent market-moving news with sentiment analysis.

    Args:
        conn: Database connection
        ticker: Optional stock/crypto ticker to filter by (searches within entities JSONB)
        days_back: Number of days to look back (1-30)
        category: Optional category filter: macro, geopolitical, policy, market
        sentiment: Optional sentiment filter: positive, negative, neutral
        limit: Maximum articles to return (1-50)

    Returns:
        JSON with articles, per-article entity sentiment, and aggregate summary
    """
    days_back = max(1, min(30, days_back))
    limit = max(1, min(50, limit))
    cutoff = date.today() - timedelta(days=days_back)

    conditions = ["published_at >= $1::date"]
    params: list = [cutoff]
    idx = 2

    if ticker:
        conditions.append(f"entities @> $${idx}$$::jsonb")
        params.append(json.dumps([{"symbol": ticker.upper()}]))
        idx += 1

    if category:
        conditions.append(f"search_category = ${idx}")
        params.append(category.lower())
        idx += 1

    if sentiment:
        conditions.append(f"sentiment_label = ${idx}")
        params.append(sentiment.lower())
        idx += 1

    where = " AND ".join(conditions)

    articles_query = f"""
        SELECT
            marketaux_uuid, title, description, snippet, source,
            published_at, entities, avg_sentiment_score, sentiment_label,
            entity_count, search_category
        FROM analysis_news_marketaux
        WHERE {where}
        ORDER BY published_at DESC
        LIMIT ${idx}
    """
    params.append(limit)

    summary_query = f"""
        SELECT
            COUNT(*) as total_articles,
            AVG(avg_sentiment_score) as overall_avg_sentiment,
            COUNT(*) FILTER (WHERE sentiment_label = 'positive') as positive_count,
            COUNT(*) FILTER (WHERE sentiment_label = 'negative') as negative_count,
            COUNT(*) FILTER (WHERE sentiment_label = 'neutral') as neutral_count
        FROM analysis_news_marketaux
        WHERE {where}
    """

    try:
        article_rows = await _safe_fetch(conn, articles_query, *params)
        summary_rows = await _safe_fetch(conn, summary_query, *params[:-1])
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    articles = []
    for row in article_rows:
        entities = json.loads(row["entities"]) if isinstance(row["entities"], str) else row["entities"]
        articles.append({
            "title": row["title"],
            "description": row["description"],
            "source": row["source"],
            "published_at": str(row["published_at"]),
            "category": row["search_category"],
            "sentiment": {
                "label": row["sentiment_label"],
                "score": _float(row["avg_sentiment_score"]),
            },
            "entities": entities[:5],
            "entity_count": row["entity_count"],
        })

    summary = {}
    if summary_rows:
        s = summary_rows[0]
        total = s["total_articles"]
        avg = _float(s["overall_avg_sentiment"])
        overall_label = "neutral"
        if avg is not None:
            overall_label = "bullish" if avg >= 0.2 else "bearish" if avg <= -0.2 else "neutral"

        summary = {
            "total_articles": total,
            "avg_sentiment": round(avg, 4) if avg is not None else None,
            "overall_signal": overall_label,
            "positive_count": s["positive_count"],
            "negative_count": s["negative_count"],
            "neutral_count": s["neutral_count"],
            "days_back": days_back,
        }

    return json.dumps({
        "ticker": ticker.upper() if ticker else None,
        "category": category,
        "sentiment_filter": sentiment,
        "summary": summary,
        "articles": articles,
    })
