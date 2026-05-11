# Slice 4 Validation: Trust-Aware Strong-Mismatch Penalty

**Date:** 2026-05-11
**Commit:** 1c1e87b (slice4(upstream): trust-aware strong-mismatch penalty in affinity scorer)
**Gateway image:** stocktracker-gateway-2.0:v1.2 (restarted, healthy, Up 2 minutes at capture time)

## Test suite

40/40 affinity tests pass (33 existing + 7 new Slice 4 tests). Zero regressions in
digest-symbol-affinity.test.ts, primary-ticker.test.ts, news-processor.test.ts,
memory-curator.test.ts. The 5 pre-existing failures in digest-brief-truth.test.ts,
digest-debug.test.ts, and recommendation-engine.test.ts are unrelated to Slice 4
(they are in files not touched by this commit).

## Reason code distribution (10 symbols, 66 candidates)

```
Trust tier distribution:
  64  none      (position_primary_* fallback)
   2  heuristic (primary_ticker_miss:heuristic:^FCHI)
   0  strong    (no marketaux_entities data in memory rows yet)
```

Primary-ticker reason codes:
- `primary_ticker_hit:strong:*` — 0 occurrences (no strong-tier data in memory yet)
- `primary_ticker_miss:strong:*` — 0 occurrences (no strong-tier data to mismatch against)
- `primary_ticker_hit:heuristic:*` — 0 occurrences
- `primary_ticker_miss:heuristic:*` — 2 occurrences (NVDA + META, both `^FCHI`, score 0)
- `primary_ticker_unknown:*` — 0 occurrences (no null-primary-with-non-null-source edge cases)

Position-primary fallback (64 candidates):
- `position_primary_hit:*` — 20 occurrences (across 9 symbols)
- `position_primary_miss:*` — 44 occurrences

## Chosen-row flips

Zero. All 10 symbols chose the same `theme` in both baseline (pre-Slice-4) and
post-deploy captures:

| Symbol   | Chosen theme (unchanged) |
|----------|--------------------------|
| AAPL     | Google Digital Health Platform Consolidation |
| NVDA     | KOSPI Record High Divergence |
| MSFT     | DOD Defense AI Procurement Expansion |
| GOOGL    | AI Capital Markets Integration |
| META     | (no memory candidate chosen) |
| TSLA     | (no memory candidate chosen) |
| BTC-USD  | Ethereum Relative Outperformance — ETH/BTC Ratio |
| ETH-USD  | US Crypto Regulatory Clarity |
| SPX500   | AI Capex Supercycle Redirects Institutional Flows |
| GOLD     | African Mining Resource Nationalism Escalation |

## Heuristic-miss regression check

The 2 observed `batch_heuristic` mismatch rows (NVDA and META, both with
`primary_ticker = "^FCHI"`) are **byte-for-byte identical** between baseline and
post-deploy:
- Score: 0 (text_token_miss + primary_ticker_miss:heuristic:^FCHI + normal_tag:n=6)
- Passed: false
- No penalty applied (heuristic miss weight = 0, unchanged)

This confirms the evidence-based decision to leave heuristic-miss at 0 penalty.

## Why no strong-tier data is visible yet

All 66 memory candidates have `trustTier = "none"` or `"heuristic"`. No
`marketaux_entities` rows have propagated to `analysis_market_memory` because:
1. `primary_ticker_source = "marketaux_entities"` only appears on `analysis_filtered_news`
2. Memory rows get `"batch_heuristic"` via majority vote over filtered-news primaries
3. The batch heuristic requires enough filtered-news rows with non-null primaries
   overlapping the theme's `affected_tickers` — coverage is still building

The strong-miss penalty (-2) is deployed and will fire once memory rows carry
non-null primaries where the primary differs from the digest symbol. The code path
is fully exercised by the 7 new unit tests.

## Conclusion

Slice 4 is deployed and verified with zero behavioral change on current production
data. This is the expected outcome: the new -2 penalty only fires on `marketaux_entities`
(strong tier) mismatches, and no memory rows currently carry that source tier.

The code change is:
- **Correct**: 7 new tests validate strong-miss penalty (-2), strong-unknown (0),
  heuristic-miss unchanged (0), and determinism
- **Safe**: zero chosen-row flips across 10 symbols, heuristic-miss path byte-identical
- **Deployed**: container healthy, reason codes visible in debug surface
- **Waiting on data**: the strong-miss penalty will activate once the news-processor
  writes `marketaux_entities` primaries that propagate to memory. A follow-up debug
  capture after the next few news-processor + memory-curator runs will show the
  penalty firing on strong-mismatch candidates

Affinity quality has not materially changed yet because the upstream data pipeline
has not produced enough strong-tier primary data in memory rows. The penalty
infrastructure is in place and will activate automatically. No code change is needed —
only time for the pipeline to produce more `marketaux_entities`-derived memory rows.
