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

**Common pattern types:**

| Pattern | Signal | Description |
|---------|--------|-------------|
| `doji` | Indecision | Open ≈ Close, market uncertainty |
| `hammer` | Bullish reversal | Small body, long lower wick |
| `shooting_star` | Bearish reversal | Small body, long upper wick |
| `marubozu_bullish` | Strong bullish | Full body, no wicks |
| `marubozu_bearish` | Strong bearish | Full body, no wicks |
| `engulfing_bullish` | Bullish reversal | Current candle engulfs previous |
| `engulfing_bearish` | Bearish reversal | Current candle engulfs previous |

## Interpreting Signals

### Signal strength indicators

1. **Body size** - Larger body = stronger conviction
   - Sort by body size to prioritize strongest signals
   - `analysis_get_bullish` and `analysis_get_bearish` already sort by body size

2. **Volume confirmation** - Higher volume validates the pattern
   - Compare current volume to recent average
   - Breakout patterns need volume > 1.5x average

3. **Pattern confluence** - Multiple patterns = higher confidence
   - Check `detected_patterns` array length
   - Multiple patterns on same candle strengthen signal

### Confidence scoring approach

```
Low confidence:  Single pattern, average volume, small body
Medium confidence: Pattern + above-average volume OR large body
High confidence: Multiple patterns + high volume + large body
```

## Workflow: Market Overview

Get aggregate statistics for trend analysis:

```
analysis_get_statistics(days=30)
```

**Response includes:**
- `bullish_bearish_ratio`: > 1.0 = bullish market bias
- `most_common_patterns`: Frequency of each pattern type
- `daily_breakdown`: Day-by-day pattern counts

**Interpretation:**

| Ratio | Market Sentiment |
|-------|------------------|
| > 1.5 | Strong bullish |
| 1.0 - 1.5 | Mild bullish |
| 0.7 - 1.0 | Mild bearish |
| < 0.7 | Strong bearish |

## Comprehensive Analysis Workflow

For complete market analysis, combine tools in sequence:

### Step 1: Get market context
```
analysis_get_statistics(days=7)
```
Understand recent market sentiment.

### Step 2: Find today's signals
```
analysis_get_bullish(analysis_date="2024-01-15")
analysis_get_bearish(analysis_date="2024-01-15")
```
Identify strongest candidates.

### Step 3: Deep dive on candidates
```
analysis_get_stock(symbol="AAPL", start_date="2024-01-08", end_date="2024-01-15")
```
Review 5-7 day history for context and confirmation.

### Step 4: Pattern validation
Look for:
- Trend alignment (bullish pattern in uptrend = continuation)
- Support/resistance levels
- Volume confirmation
- Prior pattern accuracy for this symbol

## Example: Daily Screening

**Task:** Find actionable bullish setups for January 15th

```
# 1. Check market bias
analysis_get_statistics(days=7)
# Result: ratio = 1.2 (mild bullish)

# 2. Get bullish candidates
analysis_get_bullish(analysis_date="2024-01-15")
# Result: [AAPL (hammer, body=2.4), MSFT (engulfing_bullish, body=1.8), ...]

# 3. Analyze top candidate
analysis_get_stock(symbol="AAPL", start_date="2024-01-10", end_date="2024-01-15")
# Confirm: downtrend prior, hammer at support, volume spike

# Conclusion: AAPL shows hammer reversal with confirmation
```

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| "No data for symbol" | Symbol not tracked | Verify symbol exists in database |
| "Invalid date range" | Future date or > 90 days | Use historical dates within range |
| "Pattern type not found" | Typo in pattern_type | Use exact pattern names from table above |
