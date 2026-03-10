# MCP Analysis Server

A read-only MCP (Model Context Protocol) server providing AI agents with access to financial analysis data across 9 consolidated tools.

**All operations are READ-ONLY.**

## Tools (9)

| Tool | Description |
|------|-------------|
| `analysis_ticker_overview` | Full single-call analysis for one ticker (candlestick + indicators + fundamentals + earnings + price targets) |
| `analysis_technical_signals` | Detailed indicator time series with signal detection (MACD crossovers, RSI zones, EMA/SMA) |
| `analysis_price_targets` | Pre-computed entry/target/stop-loss levels for stocks and crypto |
| `analysis_market_scan` | Market-wide sentiment, movers, and patterns (stock/crypto/all) |
| `analysis_screen` | Multi-filter stock screener (technicals + fundamentals + patterns + earnings) |
| `analysis_compare` | Peer comparison of 2-10 stocks with per-metric ranking |
| `analysis_macro` | Macro-economic environment (regime classification, indicators, catalysts) |
| `analysis_market_earnings` | Upcoming and recent earnings market-wide |
| `analysis_earnings_history` | Per-ticker earnings track record with beat streaks |

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL_PYTHON` | PostgreSQL connection string | Required |
| `MCP_PORT` | Server port | 8085 |
| `REDIS_HOST` | Redis host for caching | localhost |
| `REDIS_PORT` | Redis port | 6379 |

## Tier Endpoints

| Endpoint | Tools |
|----------|-------|
| `/mcp/free` | All 9 tools |
| `/mcp/pro` | All 9 tools (higher limits) |
| `/mcp/max` | All 9 tools (higher limits) |
| `/mcp/dev` | All 9 tools (higher limits) |
| `/mcp` | All 9 tools (backward compat) |

## Health Check

```bash
curl http://localhost:8085/health/tools
```

## Deployment

### Docker

```bash
docker build -t mcp-analysis .
docker run -p 8085:8085 \
  -e DATABASE_URL_PYTHON="postgresql://..." \
  mcp-analysis
```

### Local (stdio)

```bash
python server.py --stdio
```

## Example Queries

### Full Ticker Analysis
```json
{"symbol": "AAPL"}
```

### Market Scan
```json
{"asset_type": "stock", "direction": "bullish", "days": 1}
```

### Screen Stocks
```json
{"rsi_below": 30, "min_roe": 0.15, "max_debt_to_equity": 1.0}
```
