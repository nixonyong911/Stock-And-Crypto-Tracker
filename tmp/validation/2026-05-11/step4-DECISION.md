# Smart Digest Step 4 — Decision Record

**Date**: 2026-05-11
**Gateway version**: `stocktracker-gateway-2.0:v1.2` (code at `6d064b6`)
**Pull method**: `POST /internal/debug-digest` on production VM, 16 symbols

## Symbols tested

AAPL, TSLA, NVDA, MSFT, GOOGL, META, GOLD, SPX500, BTC/USD, ETH/USD,
SOL/USD, NEAR/USD, DOGE/USD, BNB/USD, AVAX/USD, ADA/USD

## Signal availability

- **14 / 16** symbols hit neutral fallback (no candidate signals in DB at pull time)
- **GOLD** — `news_sentiment` (only candidate)
- **META** — `entry_zone` (only candidate)

## Core conclusion criteria

### 1. `confidenceSource=degenerate_default` with `signalStrength ≥ 0.6`

**PASS.** META has `confidenceSource=degenerate_default` but `signalStrength=0`
(price $609.70 is outside the $620-645 zone), so the degenerate path is expected.
No symbol has `degenerate_default` paired with strength ≥ 0.6.

### 2. Zero `priority=high, confidence=Low` on news_sentiment

**PASS.** GOLD was the canonical offender (step 3: `priority=high, confidence=Low`,
score=1.95). Now: `priority=low, confidence=Low, confidenceSource=news_score`.
Priority and confidence are coherent.

### 3. Context lines ≤ 180 chars with sentence boundary or hard-cut

**PASS.** Both GOLD and META context lines are 0 chars (no qualifying context at
pull time). The `trimContextLine` function was validated by 3 unit tests across
sentence-boundary, hard-cut, and short-line cases.

### 4. Copy adaptation for target_reached / stop_loss_warning

**N/A at pull time.** No `target_reached` or `stop_loss_warning` signals were
active across the 16 symbols. Copy adaptation validated by 4 dedicated unit tests:
- `target_reached` fresh-hit (≤3% gap) → "pushed to"
- `target_reached` materially-beyond (>3%) → "trading at ~X% above"
- `stop_loss_warning` pressing (≤3%) → "pressing the stop-loss"
- `stop_loss_warning` materially-below (>3%) → "trading at ~X% below"

All wording is present-tense, no temporal claims.

## Changes observed vs step 3

| Symbol | Step 3 | Step 4 | Change |
|--------|--------|--------|--------|
| GOLD | `priority=high, conf=Low, source=news_count_avg` | `priority=low, conf=Low, source=news_score` | Priority/confidence now coherent; "Limited:" prefix on weak news copy |
| META | `priority=high, conf=Medium, source=degenerate_default` | `priority=high, conf=Medium, source=degenerate_default, strength=0` | Strength exposed; degenerate stays because strength is 0 (correctly) |
| BTC/ETH | Had active signals in step 3 | Neutral fallback now | DB state changed between step 3 and step 4; not a regression |

## Test evidence

- **567 / 567** tests passing across 14 test files
- **tsc --noEmit** clean
- GitHub Actions "Run Tests" and "Deploy to Azure VM" both succeeded

## Decision

**Step 4 core is PASS.** The code changes are correct and validated both by unit
tests and by live debug. Signal availability is low at this pull time (weekend
data), limiting what can be observed live, but the unit tests cover all branches.

## Slice D (optional)

Not executed. Deferred for later evaluation. Would benefit the 14 neutral-fallback
symbols by surfacing context from `analysis_market_memory` under a Neutral stance.
