# Slice 10 — Stage C commit DECISION

## Header

- **Date:** 2026-05-12T08:03 UTC
- **Commit run_id:** 28316799-3cec-4016-8311-72ecb8b90f4f
- **Mode:** COMMIT (6 rows updated in single transaction)
- **revert.sql:** present, 6 rows, verified correct

## Q1 BEFORE vs AFTER

| Metric | Before | After | Change |
|---|---|---|---|
| active_fading | 50 | 50 | — |
| inferred_nonempty | 0 | **6** | **+6** |
| primary_present | 4 | 4 | — |
| primary_incoherent | 4 | 4 | — |
| broad_n_ge_8 | 2 | 2 | — |
| broad_index_present | 26 | **22** | **-4** |

## validate-affinity AFTER

| Symbol | Candidates | Passed | Chosen Theme | Affinity | attachmentKind |
|---|---|---|---|---|---|
| SPX500 | 16 | 5 | G7 Synchronized Rate Hold | 2 | kept |
| NSDQ100 | 12 | 0 | — | — | — |
| DJ30 | 1 | 0 | — | — | — |
| AAPL | 4 | 1 | Apple AI Product Litigation | 2 | kept |
| NVDA | 5 | 1 | AI Capex Supercycle | 2 | kept |
| MSFT | 3 | 2 | AI Capital Markets | 2 | kept |
| GOOGL | 4 | 3 | Google Digital Health | 3 | kept |
| META | 2 | 0 | — | — | — |
| BTC/USD | 9 | 7 | US Crypto Regulatory Clarity | 4 | kept |
| ETH/USD | 8 | 3 | ETH Relative Outperformance | 4 | kept |
| GOLD | 4 | 2 | Pakistan Rupee Stability | 3 | kept |
| SOL/USD | 3 | 2 | Solana Institutional Breakout | 5 | kept |

All chosen rows have `attachmentKind: "kept"` (not inferred).

## Assessment

Slice 10 commit succeeded cleanly:
- 6 rows decontaminated; all broad boilerplate tickers moved to `tickers_inferred`
- `inferred_nonempty` jumped from 0 to 6
- `broad_index_present` dropped from 26 to 22
- No primaries nulled, no kept=[], no assertion violations
- `revert.sql` written and verified

## Next steps

- **Wait >=6h** for at least one curator cycle to run post-commit
- Capture iter-3 into `tmp/validation/<date>/step13-iter-3/` and evaluate against section 7 exit criteria
- Specifically check: did the curator's UPDATE path (Slice 9) correctly handle any rows it touched post-Slice-10? (Should be identity/no-op since Slice 10 already cleaned them.)
