# Slice 5 Validation: Broad-Index Boilerplate Sanitization at Memory INSERT

**Date:** 2026-05-11
**Commit:** a8919e3 (slice5(upstream): sanitize broad-index boilerplate from memory affected_tickers at INSERT)
**Gateway image:** stocktracker-gateway-2.0:v1.2 (restarted, healthy, Up 32 seconds at capture time)

## Test suite

154/154 tests pass across 4 Slice-5-relevant files (ticker-sanitizer: 22, memory-curator: 69,
primary-ticker: 23, digest-symbol-affinity: 40). Zero regressions. The 5 pre-existing failures
in digest-brief-truth.test.ts, digest-debug.test.ts, and recommendation-engine.test.ts are
unrelated to Slice 5 (same set documented in Slice 4 DECISION.md).

## Schema verification

```
 column_name    | data_type | column_default
------------------+-----------+----------------
 tickers_inferred | ARRAY     | '{}'::text[]
```

Migration 030 applied manually before CI deploy. Column exists with correct default.

## Pre-deployment contamination audit (existing rows)

15 active/fading rows carry `SPX500` in `affected_tickers`. Canonical contamination examples
(themes NOT about SPX500 but carrying it):

| Theme | affected_tickers | Actually about |
|-------|-----------------|----------------|
| JEPI Covered-Call ETF Structural Flaw | {JEPI,SPX500} | JEPI specifically |
| GameStop $56B eBay Acquisition | {GME,EBAY,SPX500} | GME/EBAY |
| California Insurance Regulatory Crisis | {PGR,ALL,TRV,SPX500} | P&C insurers |
| Healthcare Sector Defensive Outperformance | {AZN,JNJ,ROIV,WELL,GH,BLLN,ARGX,RDNT,SPX500} | AZN/JNJ sector |
| Sports Finance Institutionalization | {SPX500} | William Blair / Inner Circle Sports deal |
| Corporate Bitcoin Treasury Model | {MSTR,BTC,SPX500} | MSTR/BTC |
| Alternative Asset Manager Earnings | {KKR,APO,BX,SPX500} | KKR/PE sector |

These existing rows retain their original `affected_tickers` unchanged (INSERT-only sanitization,
no retroactive changes). Their `tickers_inferred` is `'{}'` (migration default).

## Existing row counts

All 15 SPX500-tagged rows have `tickers_inferred = {}` — confirmed post-deploy. No data was
mutated. The sanitization will apply only to future INSERT operations.

## Curator run status

The memory curator runs every 6h (news processing schedule). As of deployment, no new themes
have been created since the code went live. The next curator run will produce the first rows
with non-empty `tickers_inferred` values.

## Expected behavior on next curator run

When the curator creates new themes:

1. Themes where SPX500/QQQ/etc. appear in `affected_tickers` but no contributing filtered-news
   story evidences those tickers → boilerplate indices dropped, moved to `tickers_inferred`.
2. Themes where SPX500 IS evidenced by overlapping stories → kept in `affected_tickers`.
3. `primary_ticker` derived from RAW tickers before sanitization → anchor invariance preserved.
4. Kill switch available: `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` disables sanitization.

## What this fixes

The dominant contamination pattern in `analysis_market_memory`:

- LLM curator over-applies the prompt rule "include at least one major index symbol" to themes
  that are not about indices at all.
- This inflates `affected_tickers` (pushing rows past NARROW_TAG_MAX=3), creates spurious
  `position_primary_hit:SPX500` affinity matches, and pollutes the overlap filter in
  `fetchTickerMemoryText` for index symbols.
- The fix removes the boilerplate at the source (INSERT) so all downstream consumers benefit
  without threshold/scorer tuning.

## Conclusion

Slice 5 is deployed and verified with zero behavioral change on current production data (all
existing rows untouched, new sanitization waiting on next curator run).

The code change is:
- **Correct**: 22 new sanitizer tests + 6 new applyChanges tests validate drop/keep/fallback
  logic, anchor invariance, env flag, and determinism
- **Safe**: INSERT-only change, UPDATE/decay paths untouched, kill switch available
- **Deployed**: container healthy, migration applied, column visible
- **Waiting on data**: first sanitized rows will appear after the next memory curator run

Follow-up validation: re-run this capture after the next curator creates new themes and verify
`tickers_inferred` is non-empty on rows that would previously have carried boilerplate indices.
