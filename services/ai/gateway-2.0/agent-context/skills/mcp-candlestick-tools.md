# Analysis MCP Tools

Query financial data, candlestick patterns, technical indicators, and market signals via the `analysis_mcp` server.

## MCP Tools Reference (9 Tools)

| Tool | Purpose |
|------|---------|
| `analysis_ticker_overview` | Full single-call analysis for one ticker (candlestick + indicators + fundamentals + earnings + price targets) |
| `analysis_technical_signals` | Detailed indicator time series with signal detection over a date range |
| `analysis_price_targets` | Entry price, target price, and stop-loss levels |
| `analysis_market_scan` | Market-wide sentiment, movers, and patterns (stock/crypto/all) |
| `analysis_screen` | Multi-filter stock screener (technicals + fundamentals + patterns + earnings) |
| `analysis_compare` | Peer comparison of 2-10 stocks with rankings |
| `analysis_macro` | Macro-economic environment (regime, indicators, catalysts) |
| `analysis_market_earnings` | Upcoming and recent earnings across the market |
| `analysis_earnings_history` | Per-ticker earnings track record with beat streaks |

## Workflow: Analyze a Ticker

Single call returns everything about one stock or crypto.

```
analysis_ticker_overview(symbol="AAPL")
```

For crypto:
```
analysis_ticker_overview(symbol="BTC/USD")
```

Limit sections if you only need specific data:
```
analysis_ticker_overview(symbol="AAPL", sections=["technical", "price_targets"])
```

## Workflow: Find Daily Signals

Scan market for bullish/bearish movers:
```
analysis_market_scan(direction="bullish", days=1)
analysis_market_scan(asset_type="crypto", direction="bearish", days=1)
analysis_market_scan(pattern_type="doji", days=7)
```

## Workflow: Screen Stocks

```
analysis_screen(rsi_below=30, min_roe=0.15, max_debt_to_equity=1.0)
analysis_screen(max_pe=20, min_revenue_growth=0.15)
analysis_screen(macd_signal="bullish", pattern_signal="bullish")
```

## Workflow: Check Macro Environment

```
analysis_macro()
analysis_macro(category="inflation")
```

## Workflow: Compare Peers

```
analysis_compare(symbols=["AAPL", "MSFT", "GOOGL"])
```

## Workflow: Detailed Technical History

When you need multi-day indicator time series (not just latest snapshot):
```
analysis_technical_signals(symbol="AAPL", start_date="2026-02-01", end_date="2026-03-01")
```

## Common Pattern Types

| Pattern | Signal | Description |
|---------|--------|-------------|
| `doji` | Indecision | Open ≈ Close, market uncertainty |
| `hammer` | Bullish reversal | Small body, long lower wick |
| `shooting_star` | Bearish reversal | Small body, long upper wick |
| `marubozu_bullish` | Strong bullish | Full body, no wicks |
| `marubozu_bearish` | Strong bearish | Full body, no wicks |
| `spinning_top` | Indecision | Small body, shadows both sides |

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| "No data for symbol" | Symbol not tracked | Verify symbol exists in database |
| "Invalid date range" | Future date or > 90 days | Use historical dates within range |
| "No valid sections" | Invalid section name | Use: candlestick, technical, fundamentals, earnings, price_targets |
