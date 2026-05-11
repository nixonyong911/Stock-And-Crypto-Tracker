# R1 — Smart Digest truth-layer validation snapshot

Captured by running `scripts/preview-digest.ts --strict-vs-blended`
against the live VM postgres (via SSH tunnel) on 2026-05-10 06:25 UTC,
after Bucket A + Bucket B were applied locally.

JSON artefacts in this directory:
- `aapl.json` / `aapl.stderr.log`
- `gold.json` / `gold.stderr.log`
- `btc-usd.json` / `btc-usd.stderr.log`
- `near-usd.json` / `near-usd.stderr.log`

## Per-symbol findings

### AAPL (stock) — no signals path

- `truth` is `null` (no detection fired today).
- Brief falls into the `neutralFallbackBrief` path. Confirms A5: the
  brief's `updatedAt` is `null`, the renderer would print
  `"data unavailable"` instead of substituting wall clock time.
- whatHappening: `"No actionable technical signals right now."`

### GOLD (stock) — sanity guards firing as designed

- `truthFlags`: `open_close_unit_mismatch`, `level_out_of_band:target`,
  `level_out_of_band:periodHigh`.
- A4 caught the captured GOLD corruption (latest_close ≈ 46 vs
  latest_open ≈ 4613, plus levels in the wrong unit). The brief did
  NOT propagate the bad numbers. It downgraded to a news-sentiment
  narrative.
- whatHappening: `"Recent coverage skewed bearish across 5 stories
  (avg -0.39)."` — clean, fact-rich, sourced from the news layer.

### BTC/USD (crypto) — fact-rich target_reached

- `truthFlags`: none (clean upstream data).
- Primary signal: `target_reached`.
- Strict whatHappening: `"BTC pushed to $80395.52, into the projected
  target at $76795.25."` — exactly the B5 weave: price + level.
- Blended adds a 425-char memory phrase about Ethereum institutional
  accumulation. **The phrase is off-topic for BTC/USD** (curator memory
  was about ETH). This argues against R2 flipping to blended by
  default until memory-to-symbol relevance gates are tightened.

### NEAR/USD (crypto) — no signals + zero memory candidates

- `truth` is `null`, no signals detected.
- 0 memory candidates returned by the curator layer.
- Neutral fallback brief, clean exit.

## R2 / R3 gating recommendations

### R2 — keep `SMART_DIGEST_BRIEF_BLEND=false` (do NOT flip yet)

- BTC/USD revealed a real failure mode: a blended-mode brief about a BTC
  signal received a 425-char ETH memory phrase. Memory selection by
  `affected_tickers` overlap is too permissive when the blend phrase is
  drawn from `summary` (which describes the broader theme rather than
  the per-symbol implication).
- Strict mode's B5 output is already strong (concrete prices + levels
  + macro phrasing) so flipping is not strictly needed for quality.
- **Action**: keep the env default. Re-evaluate after the curator's
  per-symbol summarisation is tightened or after we add a per-symbol
  similarity gate to `memoryPassesBlendGate`.

### R3 — keep `SMART_DIGEST_MEMORY_FRESHNESS_HOURS=72` (no tuning today)

- Memory candidate counts in this run: AAPL=4, GOLD=5, BTC=12, NEAR=0.
- 72 h delivered enough material for the 3 symbols with active
  coverage. NEAR's empty result is from no curator activity, not from
  the gate — tightening the window would not help NEAR.
- **Action**: leave the default; reconsider only if a longer window
  meaningfully expands NEAR-style empty cases or a shorter window
  starts dropping otherwise-good context. Both should be measured
  through the `confidenceSource` and `contextSource` distributions
  once persistence (C3) is in place.
