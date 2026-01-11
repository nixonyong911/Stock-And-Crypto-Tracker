# Analysis MCP Tools Reference

Detailed documentation for all available MCP tools in the Analysis MCP server.

## Table of Contents

1. [analysis_get_stock](#analysis_get_stock)
2. [analysis_list_patterns](#analysis_list_patterns)
3. [analysis_get_bullish](#analysis_get_bullish)
4. [analysis_get_bearish](#analysis_get_bearish)
5. [analysis_get_statistics](#analysis_get_statistics)

---

## analysis_get_stock

Query candlestick analysis data for a specific stock symbol within a date range.

### Input Schema

```json
{
  "symbol": "AAPL",
  "start_date": "2024-01-01",
  "end_date": "2024-01-07"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| symbol | string | Yes | Stock ticker (1-10 chars, e.g., 'AAPL') |
| start_date | string | Yes | Start date (YYYY-MM-DD) |
| end_date | string | Yes | End date (YYYY-MM-DD) |

### Response

```json
{
  "symbol": "AAPL",
  "start_date": "2024-01-01",
  "end_date": "2024-01-07",
  "total_results": 5,
  "results": [
    {
      "symbol": "AAPL",
      "date": "2024-01-05",
      "daily_candle": {
        "open": 185.50,
        "high": 187.25,
        "low": 184.75,
        "close": 186.50,
        "volume": 45000000
      },
      "characteristics": {
        "body_size": 1.0,
        "range_size": 2.5,
        "upper_wick": 0.75,
        "lower_wick": 0.75,
        "is_bullish": true
      },
      "detected_patterns": [
        {"pattern": "hammer", "confidence": 0.85, "signal": "bullish_reversal"}
      ],
      "candles_aggregated": 1
    }
  ]
}
```

---

## analysis_list_patterns

List all detected candlestick patterns for a specific date, optionally filtered by pattern type.

### Input Schema

```json
{
  "analysis_date": "2024-01-05",
  "pattern_type": "doji"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| analysis_date | string | Yes | Date (YYYY-MM-DD) |
| pattern_type | string | No | Filter by pattern (see Supported Patterns) |

### Supported Patterns

- `doji` - Market indecision
- `long_legged_doji` - Strong indecision
- `hammer` - Bullish reversal
- `inverted_hammer` - Bullish reversal
- `shooting_star` - Bearish reversal
- `marubozu_bullish` - Strong bullish
- `marubozu_bearish` - Strong bearish
- `spinning_top` - Indecision

### Response

```json
{
  "date": "2024-01-05",
  "pattern_filter": "doji",
  "stocks_with_patterns": 12,
  "results": [
    {
      "symbol": "MSFT",
      "is_bullish": true,
      "patterns": [
        {"pattern": "doji", "confidence": 0.92, "signal": "indecision"}
      ]
    }
  ]
}
```

---

## analysis_get_bullish

Get all stocks showing bullish patterns for a specific date, ordered by body size (strongest first).

### Input Schema

```json
{
  "analysis_date": "2024-01-05"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| analysis_date | string | Yes | Date (YYYY-MM-DD) |

### Response

```json
{
  "date": "2024-01-05",
  "signal": "bullish",
  "total_bullish_stocks": 45,
  "results": [
    {
      "symbol": "NVDA",
      "name": "NVIDIA Corporation",
      "close_price": 485.50,
      "body_size": 15.25,
      "bullish_patterns": [
        {"pattern": "marubozu_bullish", "signal": "strong_bullish"}
      ],
      "all_patterns": [...]
    }
  ]
}
```

---

## analysis_get_bearish

Get all stocks showing bearish patterns for a specific date, ordered by body size (strongest first).

### Input Schema

```json
{
  "analysis_date": "2024-01-05"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| analysis_date | string | Yes | Date (YYYY-MM-DD) |

### Response

```json
{
  "date": "2024-01-05",
  "signal": "bearish",
  "total_bearish_stocks": 32,
  "results": [
    {
      "symbol": "XYZ",
      "name": "XYZ Corp",
      "close_price": 45.25,
      "body_size": 8.50,
      "bearish_patterns": [
        {"pattern": "shooting_star", "signal": "bearish_reversal"}
      ],
      "all_patterns": [...]
    }
  ]
}
```

---

## analysis_get_statistics

Get aggregate statistics for candlestick patterns over the last N days.

### Input Schema

```json
{
  "days": 7
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| days | integer | No | 7 | Days to analyze (1-90) |

### Response

```json
{
  "period": {
    "start_date": "2024-01-01",
    "end_date": "2024-01-07",
    "days": 7
  },
  "summary": {
    "total_bullish": 245,
    "total_bearish": 189,
    "overall_bullish_ratio": 56.5,
    "overall_bearish_ratio": 43.5
  },
  "most_common_patterns": [
    {"pattern": "doji", "count": 87},
    {"pattern": "spinning_top", "count": 65},
    {"pattern": "hammer", "count": 43}
  ],
  "daily_breakdown": [
    {
      "date": "2024-01-07",
      "total_stocks": 100,
      "bullish_count": 55,
      "bearish_count": 45,
      "stocks_with_patterns": 78,
      "bullish_ratio": 55.0
    }
  ]
}
```

---

## Database Table

All tools query the `analysis_stock_candlestick_pattern` table joined with `stock_tickers`.

### Key Columns

| Column | Type | Description |
|--------|------|-------------|
| analysis_date | date | Analysis date |
| daily_open/high/low/close | decimal | OHLC prices |
| daily_volume | bigint | Trading volume |
| body_size | decimal | Candle body size |
| range_size | decimal | High-low range |
| upper_wick / lower_wick | decimal | Wick sizes |
| is_bullish | boolean | Bullish candle flag |
| detected_patterns | jsonb | Array of detected patterns |
| candles_aggregated | integer | Number of candles used |
