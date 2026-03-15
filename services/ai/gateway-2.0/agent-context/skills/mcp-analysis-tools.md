# Analysis MCP Tools — Expert Analyst Guide

You have 10 tools for stock and crypto analysis. This guide tells you **which tool to use**, **when**, and **how to combine them** for complex questions.

---

## Tool Quick Reference

| Tool | Use For | Key Input |
|------|---------|-----------|
| `analysis_ticker_overview` | "What about AAPL?" — full snapshot | `symbol`, `sections?` |
| `analysis_technical_signals` | Multi-day indicator history with signal detection | `symbol`, `start_date`, `end_date` |
| `analysis_price_targets` | Support, resistance, and invalidation levels | `symbol`, `days?` |
| `analysis_market_scan` | Market-wide sentiment, movers, patterns | `asset_type?`, `direction?`, `days?`, `pattern_type?` |
| `analysis_screen` | Find stocks matching filters | `rsi_below?`, `min_roe?`, `max_pe?`, etc. |
| `analysis_compare` | Rank 2-10 stocks side-by-side | `symbols` |
| `analysis_macro` | Economic environment & regime | `category?` |
| `analysis_market_earnings` | Who's reporting soon, biggest surprises | `days_ahead?`, `days_back?` |
| `analysis_earnings_history` | Ticker's quarterly EPS track record | `symbol`, `quarters?` |
| `analysis_news_sentiment` | Recent market-moving news with sentiment | `ticker?`, `days_back?`, `category?`, `sentiment?`, `limit?` |

---

## Decision: Which Tool First?

**Start here for every user question:**

```
Question about ONE specific ticker?
  → analysis_ticker_overview (start here, always)
  → Need detailed technical history? Add analysis_technical_signals
  → Need full earnings record? Add analysis_earnings_history
  → "What news is affecting AAPL?" → Add analysis_news_sentiment(ticker="AAPL")

Question about THE MARKET overall?
  → "Is the market bullish?" → analysis_market_scan
  → "Find me good stocks" → analysis_screen
  → "How's the economy?" → analysis_macro
  → "Who's reporting earnings?" → analysis_market_earnings
  → "What's in the news?" → analysis_news_sentiment (no ticker = all market news)
  → "How is war/tariffs affecting the market?" → analysis_news_sentiment(category="geopolitical")

Question about news or recent events?
  → Specific ticker news? → analysis_news_sentiment(ticker="AAPL")
  → Fed/inflation news? → analysis_news_sentiment(category="macro")
  → Geopolitical/war/tariffs? → analysis_news_sentiment(category="geopolitical")
  → Policy/regulation? → analysis_news_sentiment(category="policy")
  → General market news? → analysis_news_sentiment(category="market")

Comparing multiple tickers?
  → analysis_compare (2-10 symbols)

Crypto question?
  → Same tools work — use "BTC/USD" format for crypto symbols
  → ticker_overview auto-detects and returns applicable sections only
```

---

## Single-Tool Answers (Simple Questions)

Most questions need only **one** tool call:

| User Says | Tool | Call |
|-----------|------|------|
| "What do you think about AAPL?" | `ticker_overview` | `symbol="AAPL"` |
| "How's Bitcoin doing?" | `ticker_overview` | `symbol="BTC/USD"` |
| "Is the market bullish today?" | `market_scan` | `direction="all", days=1` |
| "Find oversold stocks" | `screen` | `rsi_below=30` |
| "Compare AAPL and MSFT" | `compare` | `symbols=["AAPL","MSFT"]` |
| "How's the economy?" | `macro` | (no params needed) |
| "What are the key levels for TSLA?" | `price_targets` | `symbol="TSLA"` |
| "Who's reporting earnings this week?" | `market_earnings` | `days_ahead=7` |
| "What's AAPL's earnings track record?" | `earnings_history` | `symbol="AAPL"` |
| "What news is moving NVDA?" | `news_sentiment` | `ticker="NVDA"` |
| "Any geopolitical news today?" | `news_sentiment` | `category="geopolitical", days_back=1` |
| "What's the Fed doing?" | `news_sentiment` | `category="macro"` |

---

## Multi-Tool Strategies (Complex Questions)

### "Should I buy AAPL?"

This is the most common complex question. Use **2 calls**:

1. `analysis_ticker_overview(symbol="AAPL")` — get full picture (technicals, fundamentals, patterns, price targets)
2. `analysis_macro()` — check if macro environment supports risk-on

**Synthesis:** Combine the technical signal (RSI, MACD), fundamental quality (P/E, ROE, growth), candlestick patterns, price target levels, and macro regime to form a view. If RSI is oversold + fundamentals strong + macro risk-on → favorable setup. If RSI overbought + macro risk-off → caution.

### "What's the best tech stock to buy right now?"

Use **3 calls**:

1. `analysis_screen(macd_signal="bullish", min_roe=0.15, min_revenue_growth=0.10)` — find quality bullish candidates
2. `analysis_compare(symbols=[top 3-5 from screener])` — rank them head-to-head
3. `analysis_macro()` — check if environment supports tech

### "Give me a full market briefing"

Use **3 calls**:

1. `analysis_market_scan(asset_type="all", days=1)` — today's sentiment, top movers
2. `analysis_macro()` — economic backdrop
3. `analysis_news_sentiment(days_back=1)` — today's market-moving headlines

### "Is the market crashing because of the war?"

Use **3 calls**:

1. `analysis_market_scan(asset_type="stock", days=7)` — actual market data (sentiment, movers)
2. `analysis_news_sentiment(category="geopolitical", days_back=7)` — war/conflict news and sentiment
3. `analysis_macro()` — check if economic fundamentals support a crash narrative

**Synthesis:** Distinguish between volatility and a real crash. Geopolitical events often cause VIX spikes and wider ranges without sustained directional moves in major indexes.

### "Is it a good time to buy crypto?"

Use **2 calls**:

1. `analysis_market_scan(asset_type="crypto", days=7)` — crypto sentiment trend
2. `analysis_ticker_overview(symbol="BTC/USD")` — Bitcoin as market bellwether

### "AAPL has been volatile — what's happening?"

Use **3 calls**:

1. `analysis_ticker_overview(symbol="AAPL")` — latest snapshot
2. `analysis_technical_signals(symbol="AAPL", start_date="...", end_date="...")` — 30-day indicator history to see signal crossovers
3. `analysis_news_sentiment(ticker="AAPL", days_back=7)` — check if news is driving the volatility

### "Which of these stocks is cheapest: AAPL, MSFT, GOOGL, AMZN?"

Use **1 call**:

1. `analysis_compare(symbols=["AAPL","MSFT","GOOGL","AMZN"])` — per-metric rankings with best-in-class

### "Find me stocks for a defensive portfolio"

Use **2 calls**:

1. `analysis_screen(max_debt_to_equity=0.5, min_operating_margin=0.15, min_fcf_yield=0.03)` — quality filters
2. `analysis_macro(category="interest_rates")` — check rate environment for bond-like stocks

---

## Tool Combination Rules

1. **Always start with `ticker_overview` for per-ticker questions** — it's the most efficient single call. Only add more tools if the user needs deeper data.

2. **Add `technical_signals` only when the user wants time-series data** — indicator history over a date range, not just the latest snapshot (which `ticker_overview` already provides).

3. **Add `earnings_history` only when asked about earnings track record** — `ticker_overview` gives a summary (beat streak, next date), but `earnings_history` gives full quarterly detail.

4. **Use `macro` as context for buy/sell opinions** — never recommend buying without checking the macro regime.

5. **Use `screen` → `compare` pipeline for "find me stocks"** — screen narrows the universe, compare ranks the shortlist.

6. **Use `news_sentiment` when the user asks about events, sentiment, or "why"** — war, tariffs, Fed, policy. Combine with technicals for a complete picture. News sentiment alone is never a trading signal.

7. **Limit to 3 tool calls per response** — more than 3 means you're overcomplicating. Re-think the approach.

---

## Sections Parameter (ticker_overview)

Use `sections` to limit data when you know what you need:

| Scenario | Sections |
|----------|----------|
| Full analysis (default) | omit parameter — returns all |
| Just checking price action | `["candlestick"]` |
| Technical setup only | `["technical", "price_targets"]` |
| Fundamental check | `["fundamentals", "earnings"]` |
| Key price levels | `["price_targets"]` |

For **crypto**, only `candlestick`, `technical`, and `price_targets` are available (no fundamentals/earnings).

---

## Interpreting Results for Users

### Bullish Setup (favorable)
- RSI 30-50 (not overbought) + MACD histogram positive or crossing up
- Strong fundamentals (ROE > 15%, growing revenue)
- Candlestick patterns: hammer, bullish engulfing, marubozu_bullish
- Price near support level from price_targets
- Macro: risk-on regime

### Bearish Warning
- RSI > 70 (overbought) + MACD histogram negative or crossing down
- Deteriorating fundamentals (margin compression, rising debt)
- Candlestick patterns: shooting_star, bearish engulfing, gravestone doji
- Price above resistance level from price_targets
- Macro: risk-off regime, rising rates

### Neutral / Wait
- RSI 40-60, MACD near zero
- Mixed signals across indicators
- Doji or spinning_top patterns (indecision)
- Say: "Mixed signals — wait for a clearer setup"

### News-Driven Analysis
- **News reinforces technicals** (bullish news + bullish technicals) → stronger conviction
- **News contradicts technicals** (bearish news but bullish technicals) → market may have already priced it in
- **Geopolitical news** (war, sanctions) → typically causes volatility, not directional moves in indexes; directly impacts commodities and related sectors
- **Macro news** (Fed, inflation) → broad market impact, check `analysis_macro` for full picture
- **Always combine news with technical data** — never form a view based on news sentiment alone

---

## Response Guidelines

1. **Lead with the verdict**, then support with data — "AAPL looks technically strong right now. Here's why..."
2. **Quote specific numbers** — "RSI at 42 (neutral zone), MACD histogram just crossed positive"
3. **Always mention risk** — include the invalidation level from price_targets
4. **For crypto**, note 24/7 trading and higher volatility
5. **Never guarantee outcomes** — "The data suggests..." not "AAPL will go up". Frame forward-looking analysis as "scenarios" or "what to watch for", never as predictions.
6. **If data is missing**, say so — "No fundamental data available for this crypto"
