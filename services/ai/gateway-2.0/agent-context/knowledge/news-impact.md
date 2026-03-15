# News Impact Assessment Guide

Use this guide when interpreting `analysis_news_sentiment` results or when users ask about market-moving events.

---

## News Impact Tiers

### Tier 1: Sector-Specific
**Examples:** Earnings miss/beat, FDA ruling, product launch, management change
**Impact scope:** Single stock or narrow sector
**Market-wide effect:** Minimal — major indexes rarely move on single-company events
**Action:** Use `analysis_ticker_overview` or `analysis_compare` alongside news

### Tier 2: Commodity-Linked Geopolitical
**Examples:** War, regional conflicts, sanctions, OPEC decisions, supply disruptions
**Impact scope:**
- **Direct:** Commodities (oil, gold, natural gas) and commodity-linked sectors (energy, mining, defense)
- **Indirect:** Transport, airlines, manufacturing (higher input costs)
- **Broad market:** Volatility increases (VIX spikes, wider daily ranges) but major indexes often remain range-bound
**Key insight:** War and conflict typically cause **volatility, not crashes**. An elevated VIX with a flat S&P 500 signals uncertainty, not collapse.

### Tier 3: Systemic Macro
**Examples:** Fed rate decisions, banking crises, sovereign defaults, credit crunches, recession signals
**Impact scope:** Broad market — all sectors affected
**Market-wide effect:** Significant and sustained directional moves possible
**Action:** Combine `analysis_news_sentiment(category="macro")` + `analysis_macro()` + `analysis_market_scan()`

### Tier 4: Policy / Regulatory
**Examples:** Tariffs, antitrust rulings, tax changes, trade agreements, executive orders
**Impact scope:** Initially sector-specific but can broaden
- Tariffs → directly hit importing sectors, indirectly affect supply chains
- Antitrust → single company but signals regulatory posture
- Tax changes → broad but phased impact
**Action:** Check which sectors are named in the news entities

---

## Weighting Guidance

### News vs. Technicals
- **News sentiment alone is NOT a trading signal** — always cross-reference with technical data
- If news sentiment is strongly negative but technicals are neutral/bullish → the market may have already priced in the news
- If news sentiment is strongly positive and technicals confirm → higher conviction
- If news and technicals contradict → lean toward technicals for timing, news for context

### When to Emphasize News
| User's Question | News Weight | Technical Weight |
|---|---|---|
| About a specific event ("How does the war affect oil?") | **High** | Context |
| Bullish/bearish outlook ("Is AAPL bullish?") | Medium | **Medium** |
| Key price levels ("What are the key levels for TSLA?") | Context only | **Primary** |
| "Why is X moving?" | **High** | Supporting |
| General market direction | Medium | **Medium** |

### Geopolitical Events — Special Rules
- Geopolitical events cause **volatility**, not necessarily directional moves in broad indexes
- Oil, gold, and defense stocks react directly; most other sectors recover within days
- Distinguish between "the market is volatile" and "the market is crashing"
- Example: Iran conflict → oil surges, gold rises, airlines dip, but S&P 500 may stay within its range
- Only escalate to "crash" language if: major index drops >5% in a week AND macro fundamentals are deteriorating

### Commodity-Linked Events
- War/sanctions in oil-producing regions → bullish oil, bullish energy sector, bearish airlines/transport
- Supply chain disruptions → bearish manufacturing, bullish alternative suppliers
- OPEC production decisions → direct oil impact, indirect broad market impact
- Always check if the commodity move is already reflected in sector ETF prices

---

## Response Patterns

When incorporating news into analysis:

1. **State the news context first** — "Recent geopolitical tensions in the Middle East have driven oil prices higher."
2. **Connect to the specific ticker/sector** — "As an energy stock, XOM directly benefits from elevated oil prices."
3. **Cross-reference with technicals** — "Technical indicators confirm bullish momentum, with RSI at 62 and MACD positive."
4. **Assess if priced in** — "However, the stock has already rallied 8% this week, suggesting much of the news is priced in."
5. **Distinguish volatility from direction** — "Broader market indexes show increased volatility but no clear directional break."
