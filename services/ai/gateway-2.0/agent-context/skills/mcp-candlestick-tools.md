# Candlestick Analysis MCP Tools

Query candlestick patterns and market signals via the `analysis_mcp` server.

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `analysis_get_stock` | Get OHLCV data and patterns for a symbol |
| `analysis_list_patterns` | List all detected patterns for a date |
| `analysis_get_bullish` | Get bullish stocks ordered by strength |
| `analysis_get_bearish` | Get bearish stocks ordered by strength |
| `analysis_get_statistics` | Aggregate stats over N days |

## Workflow: Query by Symbol

Get candlestick data and patterns for a specific stock.

```
analysis_get_stock(symbol="AAPL", start_date="2024-01-15", end_date="2024-01-19")
```

**Response structure:**
```json
{
  "symbol": "AAPL",
  "data": [
    {
      "date": "2024-01-15",
      "open": 182.50,
      "high": 185.20,
      "low": 181.80,
      "close": 184.90,
      "volume": 45000000,
      "body_size": 2.40,
      "upper_wick": 0.30,
      "lower_wick": 0.70,
      "is_bullish": true,
      "detected_patterns": ["hammer"]
    }
  ]
}
```

**Key fields:**
- `body_size`: Absolute difference between open and close
- `upper_wick` / `lower_wick`: Wick lengths relative to body
- `is_bullish`: Close > Open
- `detected_patterns`: Array of pattern names found

## Workflow: Find Daily Signals

### Bullish signals (long opportunities)
```
analysis_get_bullish(analysis_date="2024-01-15")
```

Returns stocks with bullish patterns, strongest first (ordered by body size).

### Bearish signals (short opportunities or exits)
```
analysis_get_bearish(analysis_date="2024-01-15")
```

Returns stocks with bearish patterns, strongest first.

### All patterns for a date
```
analysis_list_patterns(analysis_date="2024-01-15")
```

Filter by pattern type:
```
analysis_list_patterns(analysis_date="2024-01-15", pattern_type="doji")
```

## Common Pattern Types

| Pattern | Signal | Description |
|---------|--------|-------------|
| `doji` | Indecision | Open ≈ Close, market uncertainty |
| `hammer` | Bullish reversal | Small body, long lower wick |
| `shooting_star` | Bearish reversal | Small body, long upper wick |
| `marubozu_bullish` | Strong bullish | Full body, no wicks |
| `marubozu_bearish` | Strong bearish | Full body, no wicks |
| `engulfing_bullish` | Bullish reversal | Current candle engulfs previous |
| `engulfing_bearish` | Bearish reversal | Current candle engulfs previous |

## Comprehensive Analysis Workflow

### Step 1: Get market context
```
analysis_get_statistics(days=7)
```

### Step 2: Find today's signals
```
analysis_get_bullish(analysis_date="2024-01-15")
analysis_get_bearish(analysis_date="2024-01-15")
```

### Step 3: Deep dive on candidates
```
analysis_get_stock(symbol="AAPL", start_date="2024-01-08", end_date="2024-01-15")
```

### Step 4: Pattern validation
Look for trend alignment, support/resistance levels, volume confirmation, and prior pattern accuracy.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| "No data for symbol" | Symbol not tracked | Verify symbol exists in database |
| "Invalid date range" | Future date or > 90 days | Use historical dates within range |
| "Pattern type not found" | Typo in pattern_type | Use exact pattern names from table above |
