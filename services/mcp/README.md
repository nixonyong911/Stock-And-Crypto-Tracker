# MCP Analysis Server

A read-only MCP (Model Context Protocol) server that provides AI agents with access to candlestick pattern analysis data.

## Overview

This server exposes tools for querying the `analysis_stock_candlestick_pattern` table, allowing AI agents to:
- Query candlestick analysis for specific stocks
- List detected patterns by date
- Get bullish/bearish stock lists
- View pattern statistics and trends

**All operations are READ-ONLY.**

## Tools Available

| Tool | Description |
|------|-------------|
| `analysis_get_stock` | Query analysis for a stock symbol within date range |
| `analysis_list_patterns` | List detected patterns for a specific date |
| `analysis_get_bullish` | Get stocks with bullish patterns |
| `analysis_get_bearish` | Get stocks with bearish patterns |
| `analysis_get_statistics` | Aggregate pattern statistics over N days |

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `MCP_PORT` | Health check port | 8085 |

## Deployment

### Docker

```bash
docker build -t mcp-analysis .
docker run -p 8085:8085 -p 8086:8086 \
  -e DATABASE_URL="postgresql://..." \
  mcp-analysis
```

### Health Check

```bash
curl http://localhost:8085/health
```

## Example Queries

### Get Stock Analysis
```json
{
  "symbol": "AAPL",
  "start_date": "2024-01-01",
  "end_date": "2024-01-07"
}
```

### List Patterns by Date
```json
{
  "analysis_date": "2024-01-05",
  "pattern_type": "doji"
}
```

### Get Statistics
```json
{
  "days": 7
}
```

## Supported Patterns

- `doji` - Market indecision
- `long_legged_doji` - Strong indecision
- `hammer` - Bullish reversal
- `inverted_hammer` - Bullish reversal
- `shooting_star` - Bearish reversal
- `marubozu_bullish` - Strong bullish
- `marubozu_bearish` - Strong bearish
- `spinning_top` - Indecision
