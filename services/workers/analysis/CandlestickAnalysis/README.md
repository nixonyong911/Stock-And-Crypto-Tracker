# Candlestick Analysis Worker

Analyzes daily candlestick patterns for stock tickers by aggregating 15-minute candles from `stock_prices` table and detecting single-candle patterns.

## Overview

- **Schedule**: Runs daily at 01:00 UTC (3 hours after TwelveData fetcher at 22:00 UTC)
- **Input**: 15-minute candles from `stock_prices` table
- **Output**: Analysis results in `analysis_stock_candlestick_pattern` table
- **Patterns Detected**: 8 single-candle patterns

## Patterns Detected

| Pattern | Signal | Description |
|---------|--------|-------------|
| Doji | Indecision | Open and close nearly equal |
| Long-Legged Doji | Strong indecision | Doji with long shadows both sides |
| Hammer | Bullish reversal | Small body at top, long lower shadow |
| Inverted Hammer | Bullish reversal | Small body at bottom, long upper shadow |
| Shooting Star | Bearish reversal | Same shape as inverted hammer |
| Bullish Marubozu | Strong bullish | Full body, no shadows |
| Bearish Marubozu | Strong bearish | Full body, no shadows |
| Spinning Top | Indecision | Small body, shadows both sides |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/live` | GET | Liveness probe |
| `/health/ready` | GET | Readiness check (DB connected) |
| `/api/status` | GET | Worker status and config |
| `/api/analyze/trigger/{symbol}` | POST | Analyze single symbol |
| `/api/analyze/trigger/all` | POST | Analyze all active stocks |
| `/api/patterns/{symbol}` | GET | Get patterns for a symbol |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ConnectionStrings__DefaultConnection` | PostgreSQL connection string | Required |
| `MetricsService__BaseUrl` | Metrics service URL | `http://metrics:8080` |
| `MetricsService__WorkerName` | Worker name for metrics | `candlestick-analysis` |
| `PATH_BASE` | API path prefix | `/api/analysis` |

### Database Registration

The worker reads its schedule from `fetch_schedules` table via `data_sources.name = 'CandlestickAnalysis'`.

## Local Development

```bash
cd services/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker
dotnet run
```

## Docker

```bash
# Build
docker build -t candlestick-analysis -f Dockerfile ../..

# Run
docker run -p 8080:8080 \
  -e ConnectionStrings__DefaultConnection="Host=..." \
  candlestick-analysis
```

## Output Schema

```sql
CREATE TABLE analysis_stock_candlestick_pattern (
    id BIGINT PRIMARY KEY,
    stock_ticker_id INT REFERENCES stock_tickers(id),
    analysis_date DATE,
    daily_open DECIMAL(18,6),
    daily_high DECIMAL(18,6),
    daily_low DECIMAL(18,6),
    daily_close DECIMAL(18,6),
    daily_volume BIGINT,
    body_size DECIMAL(18,6),
    range_size DECIMAL(18,6),
    upper_wick DECIMAL(18,6),
    lower_wick DECIMAL(18,6),
    is_bullish BOOLEAN,
    detected_patterns JSONB,  -- Array of pattern objects
    candles_aggregated INT,
    analysis_version VARCHAR(20),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE(stock_ticker_id, analysis_date)
);
```

## Pattern JSONB Format

```json
[
  {
    "pattern": "doji",
    "confidence": 0.92,
    "signal": "indecision",
    "description": "Open and close nearly equal, indicates market indecision"
  }
]
```

