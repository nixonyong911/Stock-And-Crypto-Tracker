# AI Agent: Candlestick Analysis Guide

## Overview

This guide explains how to retrieve price data from Supabase and form candlestick charts for pattern analysis.

## Data Structure

Each row in `stock_prices` or `crypto_prices` = **one candlestick**.

| Column | Candlestick Part |
|--------|------------------|
| open_price | Body top/bottom (start of period) |
| high_price | Upper wick tip |
| low_price | Lower wick tip |
| close_price | Body top/bottom (end of period) |
| volume | Confirms pattern strength |
| price_time | Candle timestamp (10-min interval) |

## Supabase MCP Queries

### Get Recent Candles for a Stock

```sql
SELECT 
    price_time,
    open_price,
    high_price,
    low_price,
    close_price,
    volume
FROM stock_prices sp
JOIN stock_tickers st ON sp.stock_ticker_id = st.id
WHERE st.symbol = 'AAPL'
ORDER BY price_time DESC
LIMIT 50;
```

### Get Candles for Date Range

```sql
SELECT 
    price_time,
    open_price,
    high_price,
    low_price,
    close_price,
    volume
FROM stock_prices sp
JOIN stock_tickers st ON sp.stock_ticker_id = st.id
WHERE st.symbol = 'AAPL'
  AND price_time >= '2024-01-15 09:30:00'
  AND price_time <= '2024-01-15 16:00:00'
ORDER BY price_time ASC;
```

### Aggregate to Hourly Candles

```sql
SELECT 
    date_trunc('hour', price_time) AS hour,
    (array_agg(open_price ORDER BY price_time ASC))[1] AS open_price,
    MAX(high_price) AS high_price,
    MIN(low_price) AS low_price,
    (array_agg(close_price ORDER BY price_time DESC))[1] AS close_price,
    SUM(volume) AS volume
FROM stock_prices sp
JOIN stock_tickers st ON sp.stock_ticker_id = st.id
WHERE st.symbol = 'AAPL'
  AND price_time >= NOW() - INTERVAL '7 days'
GROUP BY date_trunc('hour', price_time)
ORDER BY hour DESC;
```

### Aggregate to Daily Candles

```sql
SELECT 
    DATE(price_time) AS day,
    (array_agg(open_price ORDER BY price_time ASC))[1] AS open_price,
    MAX(high_price) AS high_price,
    MIN(low_price) AS low_price,
    (array_agg(close_price ORDER BY price_time DESC))[1] AS close_price,
    SUM(volume) AS volume
FROM stock_prices sp
JOIN stock_tickers st ON sp.stock_ticker_id = st.id
WHERE st.symbol = 'AAPL'
  AND price_time >= NOW() - INTERVAL '30 days'
GROUP BY DATE(price_time)
ORDER BY day DESC;
```

### Get Crypto with Market Cap

```sql
SELECT 
    price_time,
    open_price,
    high_price,
    low_price,
    close_price,
    volume,
    market_cap
FROM crypto_prices cp
JOIN crypto_tickers ct ON cp.crypto_ticker_id = ct.id
WHERE ct.symbol = 'BTC'
ORDER BY price_time DESC
LIMIT 50;
```

## Forming Candlesticks

Each query row becomes one candle:

```
Candle Structure:
                 
    │            ← high_price (upper wick)
   ─┴─
  │   │          ← body (open to close)
   ─┬─              green if close > open
    │            ← low_price (lower wick)

```

### Bullish Candle (Green)
- `close_price > open_price`
- Body: open at bottom, close at top

### Bearish Candle (Red)
- `close_price < open_price`
- Body: open at top, close at bottom

## Common Patterns to Identify

### Single Candle Patterns

| Pattern | Identification |
|---------|----------------|
| Doji | `ABS(open - close) < (high - low) * 0.1` |
| Hammer | Small body at top, long lower wick |
| Shooting Star | Small body at bottom, long upper wick |
| Marubozu | No wicks, `open ≈ low AND close ≈ high` |

### Multi-Candle Patterns

| Pattern | Candles | Description |
|---------|---------|-------------|
| Engulfing | 2 | Second candle body engulfs first |
| Morning Star | 3 | Down, small, up (bullish reversal) |
| Evening Star | 3 | Up, small, down (bearish reversal) |
| Three White Soldiers | 3 | Three consecutive green candles |
| Three Black Crows | 3 | Three consecutive red candles |

## Timeframe Usage

| Trader Type | Timeframes | Query Pattern |
|-------------|------------|---------------|
| Day Trader | 10-min, 1-hour | Raw data, hourly aggregation |
| Swing Trader | 1-hour, daily | Hourly/daily aggregation |
| Position Trader | Daily, weekly | Daily aggregation |

## Example: Pattern Detection Query

Find potential Doji patterns (last 24 hours):

```sql
SELECT 
    st.symbol,
    sp.price_time,
    sp.open_price,
    sp.high_price,
    sp.low_price,
    sp.close_price,
    ABS(sp.close_price - sp.open_price) AS body_size,
    sp.high_price - sp.low_price AS range_size
FROM stock_prices sp
JOIN stock_tickers st ON sp.stock_ticker_id = st.id
WHERE sp.price_time >= NOW() - INTERVAL '24 hours'
  AND ABS(sp.close_price - sp.open_price) < (sp.high_price - sp.low_price) * 0.1
  AND sp.high_price - sp.low_price > 0
ORDER BY sp.price_time DESC;
```

## Notes

- All times stored in UTC (timestamp with time zone)
- 10-minute candles provide granularity for intraday analysis
- Aggregate on-the-fly for longer timeframes
- Data retention: 90 days of intraday data

