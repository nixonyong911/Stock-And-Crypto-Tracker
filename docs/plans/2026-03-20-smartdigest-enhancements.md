# SmartDigest Enhancement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade SmartDigest from a basic signal broadcaster into a tier-aware, timezone-conscious recommendation engine with developing pattern alerts, morning recaps, and weekly digests.

**Architecture:** Extend the existing `recommendation-engine.ts` and `recommendations.ts` in `gateway-2.0` with tier-aware signal detection (pro indicators: Bollinger, Stochastic, ATR, insider activity, analyst consensus), dynamic daily caps, developing candlestick pattern alerts (confidence >= 0.5), a scheduled morning recap worker, and a weekly Friday digest. All new scheduled delivery uses a cron-style `node-cron` scheduler inside gateway-2.0 that respects user timezones.

**Tech Stack:** TypeScript (gateway-2.0), PostgreSQL, Redis (dedup + caps), RabbitMQ (pipeline trigger), node-cron (scheduled digests), Telegram (delivery)

---

## Prerequisites

- Pipeline orchestration is live (RabbitMQ event-driven: OHLCV → compute → price targets → `pipeline-analysis-complete`)
- Candlestick tables have `timeframe`, `is_confirmed`, `confidence` columns
- `users` table has `tier` (free/pro/max/dev) and `timezone` (IANA, default UTC) columns
- Pro indicator tables (`analysis_indicators_stock_pro`, `analysis_indicators_crypto_pro`) contain: Bollinger Bands (upper/lower/middle), ATR, Stochastic K/D, VWAP, OBV, insider transaction data, insider sentiment MSPR, analyst recommendations

---

## Current State

### What SmartDigest does today
- **Trigger:** RabbitMQ `pipeline-analysis-complete` event (every ~30 min)
- **Signal types (7):** `entry_zone`, `target_reached`, `stop_loss_warning`, `signal_change`, `momentum_shift`, `notable_pattern`, `news_sentiment`
- **Data sources:** `analysis_ticker_price_targets`, `analysis_indicators_*_free` (MACD only), `analysis_*_candlestick_pattern`, `analysis_news_marketaux`
- **Dedup:** Redis key `digest:signal:{symbol}:{type}`, TTL until midnight UTC
- **Cap:** Hardcoded 6 messages/user/day
- **Delivery:** Telegram only, to users with ticker on watchlist + paired Telegram + active session
- **NOT tier-aware:** Same signals for free and pro users
- **No scheduled digests:** No morning recap or weekly summary

### Key files
| File | Purpose |
|------|---------|
| `src/core/analysis/recommendation-engine.ts` | Signal detection: `detectSignals`, `detectForTicker`, `buildContexts`, data fetching |
| `src/core/analysis/explanation-generator.ts` | Template + optional LLM explanation for signals |
| `src/core/analysis/digest-formatter.ts` | Telegram message formatting |
| `src/core/analysis/wishlist-calculator.ts` | `secondsUntilMidnightUTC` helper |
| `src/http/recommendations.ts` | `processRecommendations`, `filterDedupSignals`, `fanOutToWatchers`, HTTP route |
| `src/core/pipeline-consumer.ts` | RabbitMQ consumer triggering `processRecommendations` |
| `src/core/tier/config.ts` | `Tier` enum (Free/Pro/Max/Dev), `getTierConfig`, `parseTier` |

### Key constants
- `MAX_DAILY_SENDS = 6` (hardcoded in `recommendations.ts`)
- `DAILY_LLM_LIMIT = 50` (in `explanation-generator.ts`)
- `ENTRY_BUFFER_PCT = 0.02` (in `recommendation-engine.ts`)
- `PATTERN_MIN_CONFIDENCE = 0.8` (in `recommendation-engine.ts`)

### Key Redis keys
- `digest:signal:{symbol}:{type}` — dedup (TTL: midnight UTC)
- `digest:count:{clerk_user_id}` — daily send cap
- `digest:llm_calls:{YYYY-MM-DD}` — LLM call limit

### Database tables used
- `user_watchlist` — `(clerk_user_id, ticker_symbol, asset_type)`
- `channel_accounts` — `(clerk_user_id, platform_user_id, channel_type)`
- `gateway_sessions` — `(clerk_user_id, channel_type, expires_at, tier)`
- `user_digest_preferences` — `(clerk_user_id, is_enabled)`
- `user_recommendation_log` — `(clerk_user_id, ticker_symbol, recommendation_type, priority, headline, message_body, timeframe_alignment, sent_at)`
- `users` — `(clerk_user_id, tier, timezone)`

---

## Task 1: Tier-Aware Signal Detection

**Goal:** Pro/Max/Dev users get richer signals from `_pro` tables. Free users only see `_free` table signals.

**Files:**
- Modify: `src/core/analysis/recommendation-engine.ts`
- Modify: `src/http/recommendations.ts`
- Modify: `src/core/tier/config.ts`
- Test: `tests/recommendation-engine.test.ts` (create if not exists)

### Step 1: Add digest tier config

In `src/core/tier/config.ts`, extend `TierConfig`:

```typescript
export interface TierConfig {
  readonly maxMessageLength: number;
  readonly cliTimeoutSeconds: number;
  readonly maxQueueDepth: number;
  readonly priority: number;
  readonly digestMaxDailySends: number;
  readonly digestPatternMinConfidence: number;
  readonly digestIncludeProIndicators: boolean;
  readonly digestIncludeDevelopingPatterns: boolean;
}
```

Update `TIER_DEFAULTS`:

```typescript
const TIER_DEFAULTS: Record<Tier, TierConfig> = {
  [Tier.Free]: {
    maxMessageLength: 2000,
    cliTimeoutSeconds: 60,
    maxQueueDepth: 1,
    priority: 1,
    digestMaxDailySends: 5,
    digestPatternMinConfidence: 0.8,
    digestIncludeProIndicators: false,
    digestIncludeDevelopingPatterns: false,
  },
  [Tier.Pro]: {
    maxMessageLength: 4000,
    cliTimeoutSeconds: 120,
    maxQueueDepth: 3,
    priority: 2,
    digestMaxDailySends: 0,  // 0 = dynamic (ceil(watchlist_count * 1.5))
    digestPatternMinConfidence: 0.5,
    digestIncludeProIndicators: true,
    digestIncludeDevelopingPatterns: true,
  },
  [Tier.Max]: {
    maxMessageLength: 8000,
    cliTimeoutSeconds: 180,
    maxQueueDepth: 5,
    priority: 3,
    digestMaxDailySends: 0,
    digestPatternMinConfidence: 0.5,
    digestIncludeProIndicators: true,
    digestIncludeDevelopingPatterns: true,
  },
  [Tier.Dev]: {
    maxMessageLength: 0,
    cliTimeoutSeconds: 300,
    maxQueueDepth: 5,
    priority: 3,
    digestMaxDailySends: 0,
    digestPatternMinConfidence: 0.5,
    digestIncludeProIndicators: true,
    digestIncludeDevelopingPatterns: true,
  },
};
```

### Step 2: Add pro indicator data fetching

In `recommendation-engine.ts`, add a new interface and fetch function:

```typescript
export interface ProIndicatorRow {
  ticker_symbol: string;
  analysis_date: string;
  bollinger_upper: string | null;
  bollinger_lower: string | null;
  bollinger_middle: string | null;
  atr: string | null;
  stochastic_k: string | null;
  stochastic_d: string | null;
  vwap: string | null;
  obv: string | null;
  insider_buy_count: string | null;
  insider_sell_count: string | null;
  insider_net_value: string | null;
  insider_mspr: string | null;
  analyst_strong_buy: string | null;
  analyst_buy: string | null;
  analyst_hold: string | null;
  analyst_sell: string | null;
  analyst_strong_sell: string | null;
}
```

Add `fetchProIndicators(db, assetType, symbolFilter?)` that queries `analysis_indicators_stock_pro` / `analysis_indicators_crypto_pro` with the same pattern as `fetchIndicators`.

### Step 3: Extend TickerCtx with pro data

Add to `TickerCtx`:

```typescript
export interface TickerCtx {
  // ...existing fields...
  pro?: {
    bollingerUpper?: number;
    bollingerLower?: number;
    bollingerMiddle?: number;
    atr?: number;
    stochasticK?: number;
    stochasticD?: number;
    vwap?: number;
    obv?: number;
    insiderBuyCount?: number;
    insiderSellCount?: number;
    insiderNetValue?: number;
    insiderMspr?: number;
    analystStrongBuy?: number;
    analystBuy?: number;
    analystHold?: number;
    analystSell?: number;
    analystStrongSell?: number;
  };
}
```

### Step 4: Add pro signal detection

Add to `detectForTicker` (only when `ctx.pro` is populated):

| Signal Type | Condition | Priority |
|-------------|-----------|----------|
| `bollinger_squeeze` | Close within 1% of both bands (bands converging) | medium |
| `bollinger_breakout` | Close breaks above upper or below lower band | high |
| `stochastic_crossover` | K crosses above/below D in overbought/oversold zone | medium |
| `volume_divergence` | OBV diverges from price direction | medium |
| `insider_activity` | Net insider buying > 3 transactions or net value > $100K (90 days) | high (buying), medium (selling) |
| `analyst_consensus` | Strong consensus shift (>60% strong buy/buy OR >40% sell/strong sell) | medium |

Add these to the `TickerSignal.type` union:

```typescript
type: 
  | "entry_zone" | "target_reached" | "stop_loss_warning" 
  | "signal_change" | "momentum_shift" | "notable_pattern" 
  | "news_sentiment"
  | "bollinger_squeeze" | "bollinger_breakout" 
  | "stochastic_crossover" | "volume_divergence"
  | "insider_activity" | "analyst_consensus";
```

### Step 5: Make detectSignals tier-aware

Change `detectSignals` signature to accept an options parameter:

```typescript
export interface DetectSignalOptions {
  includeProIndicators: boolean;
  patternMinConfidence: number;
  includeDevelopingPatterns: boolean;
}

export async function detectSignals(
  db: Pool,
  assetType: "stock" | "crypto",
  options?: DetectSignalOptions,
): Promise<TickerSignal[]> {
```

When `options.includeProIndicators` is true, also fetch pro indicators and pass them to `buildContexts`. When `options.includeDevelopingPatterns` is true and `options.patternMinConfidence` is < 0.8, include patterns with lower confidence.

### Step 6: Make fanOutToWatchers tier-aware

In `recommendations.ts`, modify `fanOutToWatchers`:

1. Change the watcher query to also fetch `u.tier` and watchlist count:

```sql
SELECT DISTINCT ON (uw.clerk_user_id) 
  uw.clerk_user_id, 
  ca.platform_user_id,
  COALESCE(u.tier, 'free') AS tier,
  (SELECT COUNT(*) FROM user_watchlist w WHERE w.clerk_user_id = uw.clerk_user_id) AS watchlist_count
FROM user_watchlist uw
JOIN channel_accounts ca ON ca.clerk_user_id = uw.clerk_user_id AND ca.channel_type = 'telegram'
JOIN gateway_sessions gs ON gs.clerk_user_id = uw.clerk_user_id AND gs.channel_type = 'telegram' AND gs.expires_at > NOW()
LEFT JOIN users u ON u.clerk_user_id = uw.clerk_user_id
WHERE uw.ticker_symbol = $1
```

2. Compute dynamic cap per watcher:

```typescript
const tierConfig = getTierConfig(parseTier(watcher.tier));
const maxSends = tierConfig.digestMaxDailySends > 0 
  ? tierConfig.digestMaxDailySends 
  : Math.ceil(watcher.watchlist_count * 1.5);
```

3. Replace hardcoded `MAX_DAILY_SENDS` with `maxSends`.

### Step 7: Run two signal passes per pipeline event

In `processRecommendations`, run signal detection twice per asset type:
1. Free-tier signals (default options) — sent to all users
2. Pro-tier signals (pro options) — sent only to pro+ users

To avoid duplicating fan-out, instead restructure so that:
- `detectSignals` is called with pro options (superset)
- `fanOutToWatchers` filters signals based on each watcher's tier before generating the explanation

### Step 8: Write tests

Create `tests/recommendation-engine.test.ts`:

```typescript
describe("detectForTicker", () => {
  it("detects entry_zone when close is within entry range");
  it("detects bollinger_squeeze when bands are converging");
  it("detects insider_activity when net buying exceeds threshold");
  it("skips pro signals when pro context is not provided");
  it("includes developing patterns when confidence >= 0.5 and option enabled");
  it("excludes developing patterns when confidence < 0.8 and option disabled");
});
```

### Step 9: Commit

```bash
git add src/core/analysis/recommendation-engine.ts src/http/recommendations.ts src/core/tier/config.ts tests/recommendation-engine.test.ts
git commit -m "feat(smartdigest): tier-aware signal detection with pro indicators"
```

---

## Task 2: Developing Pattern Alerts

**Goal:** Include developing candlestick patterns (confidence >= 0.5) for pro users, with clear "developing" labeling.

**Files:**
- Modify: `src/core/analysis/recommendation-engine.ts` (already partially done in Task 1)
- Modify: `src/core/analysis/explanation-generator.ts`
- Modify: `src/core/analysis/digest-formatter.ts`

### Step 1: Fetch developing patterns from candlestick tables

Update `fetchCandlesticks` to also return `timeframe`, `is_confirmed`, and `confidence`:

```typescript
export interface CandlestickRow {
  ticker_symbol: string;
  timeframe: string;
  is_confirmed: boolean;
  pattern_confidence: number;
  detected_patterns: Array<{
    pattern: string;
    confidence: number;
    signal: string;
  }>;
}
```

Update the SQL:

```sql
SELECT t.symbol AS ticker_symbol, cp.detected_patterns, 
       cp.timeframe, cp.is_confirmed, cp.confidence AS pattern_confidence
FROM ${table} cp
JOIN ${tickerTable} t ON cp.${fk} = t.id
WHERE cp.analysis_date >= CURRENT_DATE - INTERVAL '1 day'
```

### Step 2: Add developing pattern signal

In `detectForTicker`, when detecting `notable_pattern`:

```typescript
for (const p of ctx.patterns) {
  const isDeveloping = !p.isConfirmed;
  const minConf = isDeveloping 
    ? (options?.patternMinConfidence ?? PATTERN_MIN_CONFIDENCE)
    : PATTERN_MIN_CONFIDENCE;
    
  if (p.confidence >= minConf) {
    const label = isDeveloping ? "developing" : "confirmed";
    out.push({
      symbol,
      assetType,
      type: "notable_pattern",
      priority: isDeveloping ? "low" : (p.confidence >= 0.9 ? "medium" : "low"),
      timeframeAlignment: alignment,
      headline: `${symbol} shows ${label} ${p.pattern.replace(/_/g, " ")} pattern (${p.signal}, ${(p.confidence * 100).toFixed(0)}% confidence)`,
      rawData: { ...makeRawData(ctx), confidence: p.confidence },
    });
  }
}
```

### Step 3: Update explanation templates

In `explanation-generator.ts`, update the `notable_pattern` case in `buildWhatsHappening`:

```typescript
case "notable_pattern":
  if (d.patterns && d.patterns.length > 0) {
    const p = d.patterns[0]!;
    const confPct = d.confidence != null ? `${(d.confidence * 100).toFixed(0)}%` : "high";
    const status = d.confidence != null && d.confidence < 0.8 ? "developing" : "confirmed";
    parts.push(
      `${sym} is forming a ${status} ${p.pattern.replace(/_/g, " ")} pattern (${confPct} confidence), which is typically associated with potential ${p.signal} reversals.`,
    );
  }
  break;
```

### Step 4: Add developing pattern indicator to message format

In `digest-formatter.ts`, add a developing indicator when confidence < 0.8:

The format remains the same but the headline now includes "developing" or "confirmed" from the signal detection step.

### Step 5: Commit

```bash
git add src/core/analysis/recommendation-engine.ts src/core/analysis/explanation-generator.ts src/core/analysis/digest-formatter.ts
git commit -m "feat(smartdigest): developing pattern alerts for pro users"
```

---

## Task 3: Morning Recap (Scheduled Digest)

**Goal:** Send a timezone-aware morning market summary to each user showing activity for their watched tickers.

**Files:**
- Create: `src/core/analysis/digest-scheduler.ts`
- Create: `src/core/analysis/morning-recap.ts`
- Modify: `src/index.ts`
- Modify: `src/server.ts`

### Step 1: Install node-cron

```bash
cd services/ai/gateway-2.0
npm install node-cron @types/node-cron
```

### Step 2: Create morning-recap.ts

Path: `src/core/analysis/morning-recap.ts`

This module generates a personalized morning recap for a user:

```typescript
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

export interface MorningRecapDeps {
  db: Pool;
  redis: Redis;
  log: FastifyBaseLogger;
}

export interface TickerSummary {
  symbol: string;
  assetType: string;
  latestClose: number;
  daySignal: string;
  swingSignal: string;
  changePercent: number | null;
  topPattern: string | null;
  patternSignal: string | null;
  newsCount: number;
  newsSentiment: string | null;
}

export async function generateMorningRecap(
  deps: MorningRecapDeps,
  clerkUserId: string,
): Promise<string | null>
```

Logic:
1. Fetch user's watchlist tickers
2. For each ticker, query latest price target, candlestick patterns, news sentiment
3. Build a compact summary table
4. Return formatted Markdown message or null if no data

Message format:

```
**Good morning! Here's your market recap:**

📊 **Your Watchlist Summary**

**AAPL** — $185.20 (↑1.2%) | Swing: Bullish
  Hammer pattern detected | 3 bullish news articles

**TSLA** — $245.80 (↓0.8%) | Swing: Bearish  
  MACD momentum shifting | No notable news

**BTC** — $68,420 (↑2.1%) | Swing: Bullish
  Bullish engulfing pattern | 5 bullish news articles

---
_3 of 8 tickers have new signals. Check /watchlist for details._
_Pause morning recaps: /digest off · Pause all: /alert off_
```

### Step 3: Create digest-scheduler.ts

Path: `src/core/analysis/digest-scheduler.ts`

```typescript
import cron from "node-cron";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";

export interface DigestSchedulerDeps {
  db: Pool;
  redis: Redis;
  log: FastifyBaseLogger;
  extensions: ExtensionRegistry;
}

export function startDigestScheduler(deps: DigestSchedulerDeps): { stop: () => void }
```

Logic:
1. Run a cron every hour on the hour (`0 * * * *`)
2. Query all users who have `user_digest_preferences.is_enabled = true` (or no row = default enabled)
3. Group users by timezone
4. For each timezone where the current local time is between 7:00-8:00 AM, send the morning recap
5. Use Redis key `digest:recap:{clerk_user_id}:{YYYY-MM-DD}` to ensure exactly once per day
6. Log send counts

### Step 4: Add digest preferences columns

Create migration `services/ai/gateway-2.0/migrations/020_digest_preferences_columns.sql`:

```sql
ALTER TABLE user_digest_preferences
  ADD COLUMN IF NOT EXISTS morning_recap_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true;
```

### Step 5: Add /digest command

Create `src/extensions/telegram/commands/digest.ts`:

Supports:
- `/digest on` — enable all digests
- `/digest off` — disable all digests
- `/digest recap on|off` — toggle morning recap
- `/digest weekly on|off` — toggle weekly digest
- `/digest status` — show current preferences

### Step 6: Wire into server startup

In `src/index.ts`, start the digest scheduler after the server is created:

```typescript
const scheduler = startDigestScheduler({ db: pool, redis, log: server.log, extensions });
shutdownFns.push(() => scheduler.stop());
```

### Step 7: Commit

```bash
git add src/core/analysis/digest-scheduler.ts src/core/analysis/morning-recap.ts src/index.ts src/server.ts migrations/020_digest_preferences_columns.sql src/extensions/telegram/commands/digest.ts
git commit -m "feat(smartdigest): timezone-aware morning recap with /digest command"
```

---

## Task 4: Weekly Friday Digest

**Goal:** Send a weekly summary after Friday market close (stock) or Sunday UTC (crypto) with watchlist performance and upcoming events.

**Files:**
- Create: `src/core/analysis/weekly-digest.ts`
- Modify: `src/core/analysis/digest-scheduler.ts`

### Step 1: Create weekly-digest.ts

Path: `src/core/analysis/weekly-digest.ts`

```typescript
export async function generateWeeklyDigest(
  deps: WeeklyDigestDeps,
  clerkUserId: string,
): Promise<string | null>
```

Logic:
1. Fetch user's watchlist
2. For each ticker, query weekly performance:
   - Week open/close/high/low from `stock_prices` / `crypto_prices`
   - Weekly candlestick pattern (from `analysis_*_candlestick_pattern` WHERE `timeframe = 'weekly'`)
   - Signal changes during the week (from `analysis_ticker_price_targets`)
   - Upcoming earnings (from `analysis_earnings_dates` if date is within next 7 days)
3. Build formatted message

Message format:

```
**Weekly Market Digest — Mar 14-20, 2026**

📈 **Top Movers in Your Watchlist**

🟢 **BTC** +8.2% ($63,100 → $68,420)
  Weekly: Bullish engulfing | Swing: Bullish since Mon
  
🔴 **TSLA** -3.1% ($253.60 → $245.80)
  Weekly: Evening star | Swing: Turned bearish Wed

⚪ **AAPL** +0.4% ($184.50 → $185.20)
  Weekly: No pattern | Swing: Neutral all week

📅 **Upcoming Events**
  AAPL earnings: Mar 27 (next Thu)
  TSLA earnings: Apr 2

---
_Pause weekly digest: /digest weekly off_
```

### Step 2: Add weekly schedule to digest-scheduler.ts

Add a second cron:
- **Stock users:** Friday at 5 PM in user's timezone (after US market close)
- **Crypto:** Sunday 8 AM in user's timezone

Implementation: Run cron every hour, check if current local time matches the delivery window for any timezone group.

### Step 3: Commit

```bash
git add src/core/analysis/weekly-digest.ts src/core/analysis/digest-scheduler.ts
git commit -m "feat(smartdigest): weekly Friday digest with watchlist performance"
```

---

## Task 5: Pro Signal Explanation Templates

**Goal:** Add explanation templates for the 6 new pro signal types.

**Files:**
- Modify: `src/core/analysis/explanation-generator.ts`

### Step 1: Add template cases

Add `buildWhatsHappening` and `buildWhatToWatch` cases for:

| Signal Type | What's Happening Template | What to Watch Template |
|-------------|--------------------------|----------------------|
| `bollinger_squeeze` | "{sym}'s Bollinger Bands are converging, indicating decreasing volatility. This often precedes a significant price move." | "A breakout above ${upper} or below ${lower} would signal direction. Volume confirmation is key." |
| `bollinger_breakout` | "{sym} has broken {above/below} its Bollinger Band at ${level}, suggesting momentum is expanding." | "Watch for a sustained close {above/below} the band. A reversal back inside often signals a false breakout." |
| `stochastic_crossover` | "{sym}'s Stochastic oscillator shows a {bullish/bearish} crossover in the {overbought/oversold} zone ({K}/{D})." | "Confirmation in the next 1-2 sessions would strengthen this signal." |
| `volume_divergence` | "{sym} shows a divergence between price action and volume trend (OBV), suggesting the current move may lack conviction." | "Watch for OBV to confirm or deny the price trend. Divergence often precedes reversals." |
| `insider_activity` | "Corporate insiders have been net {buyers/sellers} of {sym}, with {count} transactions totaling ${value} over the past 90 days." | "Insider buying is historically bullish, but consider the broader technical picture." |
| `analyst_consensus` | "Wall Street consensus for {sym} is {strongly bullish/bullish/mixed/bearish}: {strongBuy} strong buy, {buy} buy, {hold} hold, {sell} sell." | "Analyst targets can shift. Cross-reference with technical levels for confirmation." |

### Step 2: Add derive functions for pro signals

```typescript
export function deriveOutlook(s: TickerSignal): string {
  // ...existing cases...
  if (s.type === "insider_activity") {
    return s.rawData.insiderNetValue && s.rawData.insiderNetValue > 0 ? "Bullish" : "Bearish";
  }
  if (s.type === "analyst_consensus") return "Mixed";
  // ...
}
```

### Step 3: Commit

```bash
git add src/core/analysis/explanation-generator.ts
git commit -m "feat(smartdigest): explanation templates for pro signal types"
```

---

## Task 6: Dedup Key Enhancement

**Goal:** Improve dedup to distinguish developing vs confirmed patterns and handle pro signal types properly.

**Files:**
- Modify: `src/http/recommendations.ts`

### Step 1: Update dedup key format

Current: `digest:signal:{symbol}:{type}`
New: `digest:signal:{symbol}:{type}:{subkey}`

Where `subkey` is:
- For `notable_pattern`: the pattern name (e.g., `hammer`, `engulfing`)
- For `insider_activity`: `buy` or `sell`
- For `bollinger_breakout`: `upper` or `lower`
- For all others: `default`

This prevents dedup from blocking a `bollinger_breakout` upper signal when a lower breakout already fired.

### Step 2: Allow developing patterns to fire again when confirmed

When a developing pattern becomes confirmed (confidence increases from <0.8 to >=0.8), it should be able to re-send. Add a `confirmed` suffix to the dedup key for confirmed patterns:

```typescript
const subkey = s.type === "notable_pattern" 
  ? `${s.rawData.patterns?.[0]?.pattern ?? "unknown"}:${s.rawData.confidence && s.rawData.confidence >= 0.8 ? "confirmed" : "developing"}`
  : "default";
const key = `digest:signal:${s.symbol}:${s.type}:${subkey}`;
```

### Step 3: Commit

```bash
git add src/http/recommendations.ts
git commit -m "feat(smartdigest): granular dedup keys for pro signals and developing patterns"
```

---

## Task 7: User Recommendation Log Enhancement

**Goal:** Log additional context for analytics and debugging.

**Files:**
- Create: migration `services/ai/gateway-2.0/migrations/021_recommendation_log_enhancement.sql`
- Modify: `src/http/recommendations.ts`

### Step 1: Add columns

```sql
ALTER TABLE user_recommendation_log
  ADD COLUMN IF NOT EXISTS user_tier VARCHAR(20),
  ADD COLUMN IF NOT EXISTS signal_data JSONB,
  ADD COLUMN IF NOT EXISTS digest_type VARCHAR(20) NOT NULL DEFAULT 'realtime';

COMMENT ON COLUMN user_recommendation_log.digest_type IS 'realtime | morning_recap | weekly_digest';
```

### Step 2: Update INSERT in fanOutToWatchers

Include `user_tier`, `signal_data` (the raw signal data for debugging), and `digest_type`.

### Step 3: Commit

```bash
git add migrations/021_recommendation_log_enhancement.sql src/http/recommendations.ts
git commit -m "feat(smartdigest): enhanced recommendation log with tier and signal data"
```

---

## Task 8: Integration Testing

**Goal:** Verify the full SmartDigest flow end-to-end.

**Files:**
- Create: `tests/smartdigest-integration.test.ts`

### Step 1: Test tier-aware signal detection

```typescript
describe("Tier-aware signal detection", () => {
  it("returns only free signals when includeProIndicators is false");
  it("returns free + pro signals when includeProIndicators is true");
  it("respects patternMinConfidence threshold");
  it("includes developing patterns only when enabled");
});
```

### Step 2: Test dynamic daily cap

```typescript
describe("Dynamic daily cap", () => {
  it("free tier capped at 5");
  it("pro tier uses ceil(watchlist_count * 1.5)");
  it("stops sending after cap reached");
});
```

### Step 3: Test dedup

```typescript
describe("Enhanced dedup", () => {
  it("deduplicates same pattern within a day");
  it("allows developing -> confirmed re-send");
  it("distinguishes bollinger upper vs lower breakout");
});
```

### Step 4: Test morning recap generation

```typescript
describe("Morning recap", () => {
  it("generates recap with watchlist data");
  it("returns null when no watchlist tickers");
  it("respects user timezone for delivery window");
});
```

### Step 5: Commit

```bash
git add tests/smartdigest-integration.test.ts
git commit -m "test(smartdigest): integration tests for tier-aware signals, caps, dedup, and recap"
```

---

## Deployment Plan

1. **Baseline check (SSH into VM)**
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → Note current image version

2. **Stage and push changes**
   - `git status` → `git add <file1> <file2> ...` → `git commit -m "msg" && git push origin main`
   - Never use `git add .` — other agents may have uncommitted changes

3. **Verify build**
   - GitHub Actions: `gh run watch`
   - If frontend modified: `vercel ls --scope=stocktracker`
   - **Only proceed when all builds pass**
   - Build fails → `gh run view <run-id> --log` or `vercel logs <url>` → Fix → Step 2

4. **Verify VM deployment**
   - SSH → `docker ps` → Compare version
   - Version incremented → Done
   - Version unchanged / container down → Fix → Step 2

5. **Post-deployment verification**
   - Check gateway-2.0 logs for digest scheduler startup
   - Verify `user_digest_preferences` migration applied
   - Trigger a manual pipeline event and verify pro signals are detected
   - Check Redis for new dedup key format

6. **Done**

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Pro indicator tables missing columns | `fetchProIndicators` handles null gracefully; signals only fire when data is present |
| Morning recap overloading Telegram API | Rate limit: max 30 messages/minute per bot. Stagger delivery across timezone groups. |
| LLM calls spiking with more signal types | Daily cap already exists (50). Pro signals use templates by default; LLM only for multi-signal synthesis. |
| node-cron drift | Cron runs hourly; timezone check has 1-hour delivery window. Acceptable for "morning" delivery. |
| Breaking existing free-tier behavior | Free tier defaults unchanged (same 7 signal types, same thresholds, same cap). Pro features are additive. |
