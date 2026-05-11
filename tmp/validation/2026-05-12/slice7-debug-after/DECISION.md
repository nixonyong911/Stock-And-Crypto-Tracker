# Slice 7 — DECISION (dormant wiring, no inferred data)

Date: 2026-05-12
Branch: A (inferred_nonempty == 0)
Status: PASS (default behavior unchanged vs Slice 6; SQL/env wiring verified)

## DB baseline
- inferred_nonempty: 0
- inferred_overlap_with_affected: 0
- inferred_disjoint_from_affected: 0
- total_active_fading: 49

## Wiring proofs (observable, not planner-assumptive)
- getIncludeInferredOnly() returns false at default: TEST OK
- SQL predicate present with $I::bool gate; params bound with false at default: STRUCTURAL TEST OK
- Default penalty (env unset) returns 0 from getInferredOnlyPenalty(): TEST OK
- Penalty clamp [-5, 0] rejects "5"/"-99": TEST OK
- fetchTickerMemoryText chosen-row deep-equal to Slice 6 baseline at default: BEHAVIORAL TEST OK
- fetchNewsHeadlines headline/one-liner maps deep-equal to Slice 6 baseline at default: BEHAVIORAL TEST OK
- fetchMemoryCandidatesForDebug candidate-list deep-equal to Slice 6 baseline at default: BEHAVIORAL TEST OK

## Test results
- digest-symbol-affinity.test.ts: 77 tests passed (includes 11 getIncludeInferredOnly env-reader tests)
- recommendation-engine.test.ts: 78 tests passed (includes structural + behavioral parity tests for fetchTickerMemoryText)
- digest-debug.test.ts: 56 tests passed (includes structural + behavioral parity tests for fetchMemoryCandidatesForDebug)
- Total: 211 tests, 0 failures

## Observed runtime state (pre-deploy — will verify post-deploy)
- BEFORE snapshot: 0 candidates with attachmentKind="inferred_only" across all 13 validation symbols (precondition guard passed)
- Validation symbols tested: SPX500, NSDQ100, DJ30, AAPL, NVDA, MSFT, GOOGL, META, BTC/USD, ETH/USD, GOLD, NEAR/USD, SOL/USD

## Per-symbol BEFORE snapshot summary

| Symbol | Candidates | Passed | Chosen Theme | AttachmentKind |
|---|---|---|---|---|
| SPX500 | 22 | 5 | G7 Synchronized Rate Hold — Hormuz Energy Shock... | kept |
| NSDQ100 | 12 | 0 | (none) | — |
| DJ30 | 2 | 0 | (none) | — |
| AAPL | 4 | 2 | Berkshire Annual Meeting Anti-Speculation Signal... | kept |
| NVDA | 3 | 1 | AI Capex Supercycle Redirects Institutional Flows... | kept |
| MSFT | 3 | 2 | AI Capital Markets Integration — Anthropic Wall St... | kept |
| GOOGL | 4 | 2 | Google Digital Health Platform Consolidation... | kept |
| META | 2 | 0 | (none) | — |
| BTC/USD | 12 | 10 | US Crypto Regulatory Clarity — SEC-CFTC MoU... | kept |
| ETH/USD | 9 | 4 | Ethereum Relative Outperformance — ETH/BTC Ratio... | kept |
| GOLD | 5 | 2 | Pakistan Rupee Near-Term Stability... | kept |
| NEAR/USD | 0 | 0 | (none) | — |
| SOL/USD | 2 | 1 | Moscow Exchange Altcoin Index Expansion... | kept |

## Chosen-row flips
- Inclusion behaviorally relevant? No (flag false AND inferred_nonempty == 0)
- Observed: 0
- Verdict: default-path behavior matches Slice 6

## Next trigger
When a future curator run produces `cardinality(tickers_inferred) > 0` rows, re-run the AFTER snapshot with `SMART_DIGEST_INCLUDE_INFERRED_ONLY=true`. No deploy required — Infisical flip suffices.
