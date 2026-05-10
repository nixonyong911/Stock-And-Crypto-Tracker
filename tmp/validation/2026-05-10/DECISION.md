# Smart Digest — Step 3 Affinity: Validation Decision Record

**Date:** 2026-05-10
**Threshold used:** `AFFINITY_MIN = 2` (default)
**Data source:** prod `analysis_market_memory`, 47 rows, status ∈ {active, fading}, last_updated ≥ NOW() − 168h
**Code under test:** `services/ai/gateway-2.0/src/core/analysis/digest-symbol-affinity.ts`
**Artefacts:** `tmp/validation/2026-05-10/<symbol>.json`

## Plan §7 pass/fail checklist

| Plan criterion | Result |
| --- | --- |
| Every candidate has `affinity.{score, threshold, reasons, passed}` | ✅ Confirmed in every artefact. |
| Chosen row (if any) has `affinity.passed === true` | ✅ All seven artefacts. |
| BTC chosen reasons include `text_token_hit:BTC` or `position_primary_hit:BTC` | ✅ `["text_token_hit:BTC", "position_primary_hit:BTC", "normal_tag:n=4"]` |
| ETH chosen reasons include `text_token_hit:ETH` or `position_primary_hit:ETH` | ✅ `["text_token_hit:ETH", "position_primary_hit:ETH", "normal_tag:n=4"]` |
| BTC and ETH never share `news_one_liner` | ✅ BTC = "US Crypto Regulatory Clarity"; ETH = "Ethereum Relative Outperformance". |
| AAPL chosen row's `affected_tickers[0]` ∉ {FXI, SPX500, NSDQ100} | ✅ Position 0 = `BTC` (Buffett-Apple-endorsement row), AAPL at position 3. |
| When every candidate fails affinity, brief.context === "" | ✅ `NEAR/USD` has 0 candidates that intersect aliases — no context line. |

## Verified rejections (canonical contamination cases from plan §1)

- **BTC vs "Real-World Asset Tokenization"** — BTC at position 2, no token in theme/one-liner: `score=1, REJECTED` ✓
- **AAPL vs "PLA Leadership Purge"** — AAPL at position 5: `score=0, REJECTED` ✓ (and same row also rejected when SPX500 is the digest symbol — SPX500 at position 2 there).
- **SPX500 vs "US-Iran War Escalation"** — 14 tickers, `broad_tag_penalty:n=14`: `score=-1, REJECTED` ✓
- **ETH vs five BTC-primary rows** — including "Bitcoin Custodial Censorship-Resistance Myth" and "US Crypto Regulatory Clarity": all `score=0, REJECTED` ✓

## Borderline cases (informational)

| Symbol | Chosen row | Score | Note |
| --- | --- | --- | --- |
| BTC/USD | "US Crypto Regulatory Clarity" | 4 | Strong on-symbol pick. |
| ETH/USD | "Ethereum Relative Outperformance" | 4 | Strong on-symbol pick. |
| AAPL | "Berkshire / Apple Endorsement" | 2 | Borderline pass — position 3, but `news_one_liner` mentions AAPL; row is genuinely about AAPL. |
| GOLD | "Pakistan Rupee Stability" | 3 | Position-1, n=1 (sole ticker). No "GOLD" token in text. Curator-asserted: `affected_tickers=[GOLD]`. Trusted via narrow-tag bonus. |
| SPX500 | "G7 Synchronized Rate Hold" | 2 | Position-1, n=6, no token. SPX500 listed first by the curator. |
| SOL/USD | "Moscow Exchange Altcoin Index Expansion" | 4 | SOL at position 1, n=6, "SOL" token present. |
| NEAR/USD | (none) | — | 0 candidates intersect aliases; per "prefer omission over wrong context", no line. |

The "ETH/BTC Ratio" theme — the original step-3 contamination case — still **borderline-passes for BTC at score=2** (it borrows a "BTC" token from "ETH/BTC"), but it is **no longer chosen** because a `score=4` row outranks it. The new ranking does the right thing without needing a stricter threshold.

## Decision

### Threshold and weights

**Keep `SMART_DIGEST_MEMORY_AFFINITY_MIN = 2` (the default).** No code change.

Justification:
- Every canonical contamination case from the plan is rejected at threshold 2.
- Every chosen row across the seven validation symbols is on-symbol — no false positives surfaced.
- The two genuinely borderline rows (AAPL Buffett-endorsement at score 2, SPX500 G7-rate-hold at score 2) are real on-symbol picks; raising the threshold to 3 would cut both for no observed quality gain.
- The "ETH/BTC Ratio" row is a borderline pass but does not win — the ranking key (`affinity DESC`) already demotes it. A stricter threshold buys nothing here.

### Deferred enhancements — status update

Both pass-1 deferred items in plan §8 remain **deferred**:

1. **Human-name tokens (`Bitcoin`, `Apple`, …).** Validation did not surface a single chosen-row case where a human-name token would have changed the outcome. The only candidate that would clearly benefit is GOLD's chosen row (no "GOLD"/"Gold" in text); but it already passes via the position-primary + narrow-tag bonus, and the row is correctly on-symbol. No engineering pressure to ship this in pass 2.
2. **Scoring `summary` for blended mode.** Out of scope until blended mode is reconsidered (see plan §10). Strict mode remains the default.

### Blended mode

**Keep `SMART_DIGEST_BRIEF_BLEND=false`.** Step 3 hardens `news_one_liner` only; `summary` is not gated. Re-evaluation is a separate decision.

## Rollback

If a future regression appears, the affinity gate is reversible without code changes:

- Lower the gate to score 1 (relaxes contamination filter): `SMART_DIGEST_MEMORY_AFFINITY_MIN=1`
- Effectively disable the gate (admits any row with `affected_tickers` intersection): `SMART_DIGEST_MEMORY_AFFINITY_MIN=0`

The full debug surface (`/internal/debug-digest`) exposes per-candidate score, threshold, reasons, and pass/fail to support evidence-based future tuning.
