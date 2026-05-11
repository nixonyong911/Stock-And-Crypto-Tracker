# Smart Digest Step 5 — Live Validation Decision

**Date:** 2026-05-11
**Build:** `gateway-2.0:v1.2` (commit `1d530d3`, post-deploy uptime 40s)
**Symbol set:** AAPL, BTC/USD, NVDA, TSLA, GOLD, META, ETH/USD, GOOGL, SPX500, SOL/USD, MSFT
**Captures:** `step5-debug-before/*.json` (pre-deploy), `step5-debug-after/*.json` (post-deploy)

## Conclusion

Smart Digest context quality is materially better than Step 4 along the
two axes Step 5 set out to address:

1. **Ranking is now coherent and inspectable.** Every candidate row in
   `/internal/debug-digest` exposes `rankKey.{ageHours, freshnessDecay,
   oneLinerOnSymbol, compositeAssociationScore}` plus `surfacing.{score,
   threshold, decision}`. Reviewers can read off the full reasoning
   chain without having to reproduce the comparator.
2. **Surfacing is decoupled from association.** The same chosen row can
   be flagged "good enough to render" or "deliberately omitted as
   weak" with machine-readable codes (`passed_floor_above_threshold`,
   `passed_floor_below_threshold`, `failed_floor`). Two of the
   three problematic prod patterns we identified (MSFT off-symbol
   medium row, GOOGL off-symbol medium row) now produce
   `passed_floor_below_threshold` instead of silently surfacing
   misleading text.

The `impact_rank` hard-primary hypothesis held up under live data — no
captured symbol showed a fresh high-impact row losing to a stale
critical row in a way that hurt the user-facing line. Keeping impact as
the hard primary remains the right call for now.

## Live evidence

### Symbols where Step 5 measurably tightens surfacing

| Symbol | Before contextSource | After surfacing.decision | After score | Notes |
| --- | --- | --- | --- | --- |
| MSFT | none (neutralFallback) | passed_floor_below_threshold | 0.357 | Chosen row's one-liner is an Anthropic / Wall Street JV line, not about MSFT. Floor would have passed (medium / 69h / rel ≥ 0.5). Step 5 correctly omits. |
| GOOGL | none (neutralFallback) | passed_floor_below_threshold | 0.457 | Chosen row is a Google Digital Health consolidation line, not GOOGL-stock material. Same pattern as MSFT. Step 5 correctly omits. |
| AAPL | none (neutralFallback) | failed_floor | n/a | Chosen row is a 171h-old Berkshire row. `freshnessDecay = 0` and the floor freshness gate (72h) rejects it before scoring. Reason is now machine-readable. |
| GOLD | none | failed_floor | n/a | Chosen row is "Pakistan Rupee" with `oneLinerOnSymbol=false` and impact=low. Floor rejects on impact. The misleading association from Step 3 affinity is correctly suppressed at surfacing. |
| TSLA | none | failed_floor | n/a | Chosen row is a "Second-Life EV Battery" line, low impact and stale. Floor rejects on impact and freshness. |
| SPX500 / SOL/USD | none | failed_floor | n/a | Both chosen rows are stale (141h, 87h). Floor rejects on freshness; surfacing layer never has to score them. |

### Symbols where high-quality on-symbol context continues to surface (no regression)

| Symbol | After surfacing.score | After surfacing.decision |
| --- | --- | --- |
| BTC/USD | 0.930 | passed_floor_above_threshold |
| ETH/USD | 0.930 | passed_floor_above_threshold |

Both rows are on-symbol (`oneLinerOnSymbol=true`), high-impact, fresh
(~3.5h), with relevance ≥ 0.85. The composite score crosses the
threshold by a wide margin; surfacing the line is unambiguously the
right call.

### Symbols with no primary signal

NVDA, META, TSLA, GOOGL, SPX500, SOL/USD, MSFT, AAPL all returned
`neutralFallbackUsed: true` in this capture window because the upstream
signal pipeline produced no entries for them. The neutral fallback
brief is independent of memory context, so the surfacing layer's job
on those symbols is purely diagnostic — it reports what *would* have
happened had a primary signal been present. That diagnostic is exactly
the inspectability win Step 5 was designed to deliver.

## Hypothesis check: impact as a hard primary

The plan flagged `impactRank` as a hypothesis to validate. Across the
11-symbol set, every "would-be-misleading" row was either:

- **Floor-rejected** (AAPL, GOLD, TSLA, SPX500, SOL/USD) because impact
  was too low or freshness had decayed to zero, or
- **Surfacing-rejected** (MSFT, GOOGL) because the score landed below
  threshold, driven by `oneLinerOnSymbol=false` plus only-medium impact.

No captured symbol exhibited a stale critical row beating a fresh high
row in a way that produced worse user-facing context. Recommendation:
keep `impactRank` as the hard primary for now and revisit only if a
future capture demonstrates the inverse.

## Tests

585 / 585 vitest tests pass (was 567 before Step 5):

- `digest-symbol-affinity` (25), `recommendation-engine` (66 ← +11 for
  freshnessDecay, compositeAssociationScore, ranking integration),
  `digest-brief-truth` (72 ← +7 for surfacing decision tiers),
  `digest-debug` (39 ← updated whyLost assertion).
- `tsc --noEmit` clean.

## Operational follow-ups

- The `SMART_DIGEST_SURFACING_MIN` env knob (default `0.55`) is in
  place. No need to tune in this window.
- The neutral-fallback context-injection feature flagged in the plan as
  optional / late was deliberately *not* shipped in this round.
