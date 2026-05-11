# Slice 6 — Consumer adoption of `tickers_inferred` — Decision

**Date:** 2026-05-11
**Status:** Verified via tests; awaiting first curator run for live data validation.

## Summary

Slice 6 wires `analysis_market_memory.tickers_inferred` through the Smart Digest read path. Every memory-row candidate now carries an `attachmentKind` classification (`kept`, `inferred_only`, `both`, `none`) and emits `inferred_ticker_present:*` reason codes for inspectability. A configurable, zero-default penalty knob (`SMART_DIGEST_INFERRED_ONLY_PENALTY`) exists for future tuning.

## Test results

| Suite | Tests | Passed | New |
|---|---|---|---|
| `digest-symbol-affinity.test.ts` | 66 | 66 | 26 (Slice 6: classification, env clamp, determinism, 8 validation symbols) |
| `recommendation-engine.test.ts` | 71 | 71 | 2 (Slice 6: tickers_inferred passthrough regression) |
| `digest-debug.test.ts` | 49 | 49 | 3 (Slice 6: tickersInferred + attachmentKind surface) |
| **Total** | **186** | **186** | **31** |

## Reason code distribution by attachmentKind (test evidence)

| attachmentKind | Expected reason codes | Verified |
|---|---|---|
| `kept` | No `attachment_inferred_only:*`; position/primary branches fire normally | Yes |
| `inferred_only` | `attachment_inferred_only:<ALIAS>` replaces position/primary; `inferred_ticker_present:*` emitted | Yes |
| `both` | Treated as `kept` (defensive); position/primary branches fire | Yes |
| `none` | No attachment codes; position/primary branches fire | Yes |

## Env clamp verification

| Input | Clamped output |
|---|---|
| unset / empty | `0` |
| `"abc"` (non-numeric) | `0` |
| `"-3"` | `-3` |
| `"-99"` | `-5` (floor) |
| `"5"` | `0` (ceiling) |

## Validation symbols — smoke test

All 8 required symbols (SPX500, NSDQ100, DJ30, AAPL, NVDA, META, BTC/USD, ETH/USD) were tested with synthetic `inferred_only` fixture rows and produced:
- `attachmentKind === "inferred_only"` — correct
- `attachment_inferred_only:<SYMBOL>` reason — present
- `inferred_ticker_present:<SYMBOL>` reason — present
- No `position_primary_*` or `primary_ticker_*` reasons — correct

## Chosen-row flips

**Expected: zero.** Default penalty is 0, and `tickers_inferred` has 0 non-empty rows in production. No behavior change at deploy time.

## DB state (production, observed 2026-05-11)

- `tickers_inferred` column exists, default `'{}'::text[]`
- `cardinality(tickers_inferred) > 0`: **0 rows** (next curator run pending)
- 15 active/fading rows still carry SPX500 in `affected_tickers` (legacy contamination — out of scope for Slice 6)

## What happens next

1. **Curator run** — the next curator INSERT will produce the first non-empty `tickers_inferred` rows via Slice 5's sanitizer.
2. **Post-curator snapshot** — re-run `validate-affinity.ts` after data exists to verify `inferred_ticker_present:*` codes appear in production debug output.
3. **Slice 7** — once data accumulates, decide whether to set a non-zero `SMART_DIGEST_INFERRED_ONLY_PENALTY` and/or open the SQL filter to inferred-only matches.

## Anomalies

None observed. Two pre-existing flaky tests in `recommendation-engine.test.ts` and `digest-debug.test.ts` were fixed as part of this slice (fixed-date `last_updated` timestamps that aged past the 72-hour freshness window).
