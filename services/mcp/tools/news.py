"""News analysis tools: AI-filtered news with sentiment, and raw unfiltered news for dev inspection."""

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
    Get recent AI-filtered news with sentiment analysis.

    Args:
        conn: Database connection
        ticker: Optional ticker to filter by (matches against affected_tickers array)
        days_back: Number of days to look back (1-30)
        category: Optional category filter
        sentiment: Optional sentiment filter: bullish, bearish, neutral
        limit: Maximum articles to return (1-50)

    Returns:
        JSON with articles and aggregate sentiment summary
    """
    days_back = max(1, min(30, days_back))
    limit = max(1, min(50, limit))
    cutoff = date.today() - timedelta(days=days_back)

    conditions = ["processed_at >= $1::date"]
    params: list = [cutoff]
    idx = 2

    if ticker:
        conditions.append(f"${idx} = ANY(affected_tickers)")
        params.append(ticker.upper())
        idx += 1

    if category:
        conditions.append(f"category = ${idx}")
        params.append(category.lower())
        idx += 1

    if sentiment:
        conditions.append(f"sentiment = ${idx}")
        params.append(sentiment.lower())
        idx += 1

    where = " AND ".join(conditions)

    articles_query = f"""
        SELECT
            headline, summary, category, impact_level,
            affected_tickers, sentiment, sentiment_score,
            key_points, market_implications, processed_at
        FROM analysis_filtered_news
        WHERE {where}
        ORDER BY processed_at DESC
        LIMIT ${idx}
    """
    params.append(limit)

    summary_query = f"""
        SELECT
            COUNT(*) as total_articles,
            AVG(sentiment_score) as avg_sentiment,
            COUNT(*) FILTER (WHERE sentiment = 'bullish') as bullish_count,
            COUNT(*) FILTER (WHERE sentiment = 'bearish') as bearish_count,
            COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_count
        FROM analysis_filtered_news
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
        articles.append({
            "headline": row["headline"],
            "summary": row["summary"],
            "category": row["category"],
            "impact_level": row["impact_level"],
            "affected_tickers": row["affected_tickers"],
            "sentiment": row["sentiment"],
            "sentiment_score": _float(row["sentiment_score"]),
            "key_points": row["key_points"],
            "market_implications": row["market_implications"],
            "processed_at": str(row["processed_at"]),
        })

    summary = {}
    if summary_rows:
        s = summary_rows[0]
        total = s["total_articles"]
        avg = _float(s["avg_sentiment"])
        overall_label = "neutral"
        if avg is not None:
            overall_label = "bullish" if avg >= 0.2 else "bearish" if avg <= -0.2 else "neutral"

        summary = {
            "total_articles": total,
            "avg_sentiment": round(avg, 4) if avg is not None else None,
            "overall_signal": overall_label,
            "bullish_count": s["bullish_count"],
            "bearish_count": s["bearish_count"],
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


async def get_news_headlines(
    conn,
    days_back: int = 3,
    category: str | None = None,
    limit: int = 20,
) -> str:
    """
    Get recent AI-filtered news headlines.

    Args:
        conn: Database connection
        days_back: Number of days to look back (1-30)
        category: Optional category filter
        limit: Maximum articles to return (1-50)

    Returns:
        JSON with filtered news articles and count summary
    """
    days_back = max(1, min(30, days_back))
    limit = max(1, min(50, limit))
    cutoff = date.today() - timedelta(days=days_back)

    conditions = ["processed_at >= $1::date"]
    params: list = [cutoff]
    idx = 2

    if category:
        conditions.append(f"category = ${idx}")
        params.append(category.lower())
        idx += 1

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            headline, summary, category, impact_level,
            sentiment, key_points, processed_at
        FROM analysis_filtered_news
        WHERE {where}
        ORDER BY processed_at DESC
        LIMIT ${idx}
    """
    params.append(limit)

    count_query = f"""
        SELECT COUNT(*) as total
        FROM analysis_filtered_news
        WHERE {where}
    """

    try:
        rows = await _safe_fetch(conn, query, *params)
        count_rows = await _safe_fetch(conn, count_query, *params[:-1])
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    articles = []
    for row in rows:
        articles.append({
            "headline": row["headline"],
            "summary": row["summary"],
            "category": row["category"],
            "impact_level": row["impact_level"],
            "sentiment": row["sentiment"],
            "key_points": row["key_points"],
            "processed_at": str(row["processed_at"]),
        })

    summary = {}
    if count_rows:
        summary = {
            "total_articles": count_rows[0]["total"],
            "days_back": days_back,
        }

    return json.dumps({
        "category": category,
        "summary": summary,
        "articles": articles,
    })


async def get_unfiltered_news(
    conn,
    source: str | None = None,
    days_back: int = 3,
    category: str | None = None,
    limit: int = 30,
) -> str:
    """
    Dev-only: read raw unfiltered news before AI processing.

    Args:
        conn: Database connection
        source: Optional source filter: 'marketaux' or 'gnews'
        days_back: Number of days to look back (1-30)
        category: Optional search category filter
        limit: Maximum articles to return (1-50)

    Returns:
        JSON with raw unfiltered articles
    """
    days_back = max(1, min(30, days_back))
    limit = max(1, min(50, limit))
    cutoff = date.today() - timedelta(days=days_back)

    conditions = ["published_at >= $1::date"]
    params: list = [cutoff]
    idx = 2

    if source:
        conditions.append(f"source_api = ${idx}")
        params.append(source.lower())
        idx += 1

    if category:
        conditions.append(f"search_category = ${idx}")
        params.append(category.lower())
        idx += 1

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            source_api, title, description,
            published_at, search_category, sentiment_label
        FROM unfiltered_news_combined
        WHERE {where}
        ORDER BY published_at DESC
        LIMIT ${idx}
    """
    params.append(limit)

    count_query = f"""
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE source_api = 'marketaux') as marketaux_count,
            COUNT(*) FILTER (WHERE source_api = 'gnews') as gnews_count
        FROM unfiltered_news_combined
        WHERE {where}
    """

    try:
        rows = await _safe_fetch(conn, query, *params)
        count_rows = await _safe_fetch(conn, count_query, *params[:-1])
    except asyncio.TimeoutError:
        return json.dumps({
            "error": "Query timeout",
            "message": f"Query took longer than {QUERY_TIMEOUT}s",
        })

    articles = []
    for row in rows:
        articles.append({
            "source_api": row["source_api"],
            "title": row["title"],
            "description": row["description"],
            "published_at": str(row["published_at"]),
            "search_category": row["search_category"],
            "sentiment_label": row["sentiment_label"],
        })

    summary = {}
    if count_rows:
        c = count_rows[0]
        summary = {
            "total_articles": c["total"],
            "marketaux_count": c["marketaux_count"],
            "gnews_count": c["gnews_count"],
            "days_back": days_back,
        }

    return json.dumps({
        "source_filter": source,
        "category": category,
        "summary": summary,
        "articles": articles,
    })


async def get_process_news_trigger(conn) -> str:
    """
    Dev-only: informational tool about how to trigger news processing.

    Returns:
        JSON message with instructions for triggering news processing
    """
    return json.dumps({
        "message": (
            "To trigger news processing, POST to the AI gateway endpoint "
            "/internal/process-news with the x-service-key header. "
            "This tool is informational only — it cannot invoke the endpoint directly."
        ),
    })
