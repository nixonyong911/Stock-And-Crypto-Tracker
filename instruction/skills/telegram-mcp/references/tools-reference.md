# Analysis MCP Tools Reference

Detailed documentation for all 9 MCP tools in the Analysis MCP server.

## Table of Contents

1. [analysis_ticker_overview](#analysis_ticker_overview)
2. [analysis_technical_signals](#analysis_technical_signals)
3. [analysis_price_targets](#analysis_price_targets)
4. [analysis_market_scan](#analysis_market_scan)
5. [analysis_screen](#analysis_screen)
6. [analysis_compare](#analysis_compare)
7. [analysis_macro](#analysis_macro)
8. [analysis_market_earnings](#analysis_market_earnings)
9. [analysis_earnings_history](#analysis_earnings_history)

---

## analysis_ticker_overview

Comprehensive single-call analysis for one ticker (stock or crypto). Auto-detects asset type from symbol format (BTC/USD = crypto).

### Input Schema

```json
{
  "symbol": "AAPL",
  "sections": ["candlestick", "technical", "fundamentals", "earnings", "price_targets"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| symbol | string | Yes | Ticker symbol (e.g., 'AAPL' or 'BTC/USD') |
| sections | array | No | Sections to include (default: all applicable) |

### Response

```json
{
  "symbol": "AAPL",
  "asset_type": "stock",
  "candlestick": { "latest": {...}, "patterns": [...], "recent_sentiment": {...} },
  "technical": { "sma_20": 185.0, "ema_20": 186.0, "rsi": 55.0, "macd": {...}, "assessment": {...} },
  "fundamentals": { "valuation": {...}, "growth": {...}, "profitability": {...}, "health": {...} },
  "earnings": { "next_earnings": {...}, "beat_streak": 4, "avg_eps_surprise_pct": 3.2 },
  "price_targets": { "entry_price": 180.0, "target_price": 195.0, "stop_loss": 175.0, "signal": "bullish" }
}
```

---

## analysis_technical_signals

Detailed daily technical indicators over a date range with signal detection. Works for both stocks and crypto.

### Input Schema

```json
{
  "symbol": "AAPL",
  "start_date": "2026-02-01",
  "end_date": "2026-03-01"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| symbol | string | Yes | Ticker symbol (stock or crypto) |
| start_date | string | Yes | Start date (YYYY-MM-DD) |
| end_date | string | Yes | End date (YYYY-MM-DD) |

---

## analysis_price_targets

Pre-computed entry price, target price, and stop-loss for a stock or crypto.

### Input Schema

```json
{
  "symbol": "AAPL",
  "days": 1
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| symbol | string | Yes | - | Ticker symbol |
| days | integer | No | 1 | Recent days to return (1-30) |

---

## analysis_market_scan

Market-wide sentiment scan across stocks and/or crypto. Replaces the old bullish/bearish/statistics/patterns tools.

### Input Schema

```json
{
  "asset_type": "all",
  "direction": "bullish",
  "days": 1,
  "pattern_type": "doji"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| asset_type | string | No | all | 'stock', 'crypto', or 'all' |
| direction | string | No | all | 'bullish', 'bearish', or 'all' |
| days | integer | No | 1 | Days to analyze (1-90) |
| pattern_type | string | No | null | Filter by pattern name |

---

## analysis_screen

Multi-signal cross-domain stock screener. At least one filter required.

### Input Schema

```json
{
  "rsi_below": 30,
  "min_roe": 0.15,
  "max_debt_to_equity": 1.0,
  "limit": 20,
  "sort_by": "rsi"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rsi_above / rsi_below | float | No | RSI thresholds |
| macd_signal | string | No | 'bullish' or 'bearish' |
| max_pe / min_roe / ... | float | No | Fundamental filters |
| pattern_signal | string | No | 'bullish' or 'bearish' |
| earnings_within_days | int | No | Stocks with upcoming earnings |
| limit | int | No | Max results (1-50, default 20) |
| sort_by | string | No | Sort metric |

---

## analysis_compare

Side-by-side peer comparison of 2-10 stocks with per-metric ranking.

### Input Schema

```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL"]
}
```

---

## analysis_macro

Current macro-economic environment assessment.

### Input Schema

```json
{
  "category": "inflation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | string | No | Filter: inflation, employment, growth, interest_rates, etc. |

---

## analysis_market_earnings

Market-wide earnings dashboard: upcoming reporters and recent surprises.

### Input Schema

```json
{
  "days_ahead": 7,
  "days_back": 14,
  "min_surprise_pct": 2.0
}
```

---

## analysis_earnings_history

Earnings track record for a single stock with beat streak analysis.

### Input Schema

```json
{
  "symbol": "AAPL",
  "quarters": 4
}
```

---

## Database Tables

| Table | Used By |
|-------|---------|
| analysis_stock_candlestick_pattern | ticker_overview, market_scan, screen |
| analysis_crypto_candlestick_pattern | ticker_overview, market_scan |
| analysis_indicators_stock_free | ticker_overview, technical_signals, screen, compare |
| analysis_indicators_crypto_free | ticker_overview, technical_signals |
| analysis_stock_fundamentals | ticker_overview, screen, compare |
| analysis_earnings_release_schedule | ticker_overview, screen, market_earnings, earnings_history |
| analysis_economic_indicators | macro |
| analysis_release_calendar | macro |
| analysis_ticker_price_targets | ticker_overview, price_targets |
