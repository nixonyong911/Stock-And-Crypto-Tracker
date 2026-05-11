# Slice 3 Validation: Consumer-Side Primary Ticker Adoption

**Date:** 2026-05-11
**Commit:** 59326cd (slice3(upstream): adopt primary_ticker in Smart Digest affinity scorer)
**Gateway image:** stocktracker-gateway-2.0:v1.2 (restarted, healthy)

## Test suite

477/477 tests pass across 15 test files. Zero regressions.
New tests cover: strong hit/miss, heuristic hit/miss, NULL fallback, determinism,
integration recovery/contamination-defense, and debug surface reason codes.

## SQL agreement check

```
 primary_ticker_source |  agreement   | count
-----------------------+--------------+-------
                       | null_primary |    23
```

All 23 memory rows within the 72h freshness window have NULL `primary_ticker_source`.
The news-processor has not run since Slice 2 deployed, so no filtered-news rows carry
a `marketaux_entities` primary yet, and no batch-heuristic primaries have propagated
to memory. This is expected: Slice 2 was "no backfill" by design.

## Debug snapshot diff (11 symbols)

All 11 symbols (AAPL, NVDA, GOOGL, META, MSFT, TSLA, SPX500, GOLD, BTC-USD,
ETH-USD, SOL-USD) show **zero behavioral change** vs the step5-debug-after baseline.
Every candidate's `primaryTicker.source` is `null`, so the scorer executes the
legacy `position_primary_*` fallback identically to pre-Slice-3 code.

This confirms:
- The additive migration is safe — no regression on any symbol.
- The new `primary_ticker_hit:*` / `primary_ticker_miss:*` reason codes will activate
  once the upstream pipeline populates non-null primaries.

## Conclusion

Slice 3 is deployed and verified. The consumer-side adoption code is live but dormant
because upstream data hasn't flowed through yet. Once the news-processor runs and
writes `marketaux_entities` primaries to filtered news, and the memory-curator
propagates `batch_heuristic` primaries, the affinity scorer will start using the new
upstream signal. At that point, a follow-up debug capture will show the new reason
codes firing and potentially shifted `chosen` rows on symbols where position-primary
disagreed with the upstream subject signal.

The cautious +3/+2 weight values are reasonable starting points. Whether to add a
negative penalty on strong-tier mismatch (Slice 4 candidate) should be decided after
observing real `disagrees_with_position` rates once upstream data flows.
