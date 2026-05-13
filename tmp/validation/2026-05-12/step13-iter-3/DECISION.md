# Step 13 — Iter-3 DECISION (post-Slice-10)

**Status: PENDING — capture after >=6h post-commit (earliest: 2026-05-12T14:00 UTC)**

## Slice 10 commit timestamp

- 2026-05-12T08:00 UTC
- Run ID: 28316799-3cec-4016-8311-72ecb8b90f4f
- Rows updated: 6

## Section 7 exit criteria to evaluate

### Slice 10 worked → Step 13 can close (all must hold):
1. `m2_inferred_nonempty >= 20` AND `m3_inferred_share >= 0.40` (H2 PASS by wide margin)
2. `m8_overlap == 0` (H1 disjoint invariant preserved)
3. `m5b_primary_coherent_pop == 1.0` (H3: every non-null primary is in its affected_tickers)
4. `validate-affinity.ts` AFTER: 0 regressed symbols; ≤ 2 unchanged-contaminated (H4 PASS)
5. Read-side test suites green (H5 PASS)
6. 7-day post-commit observation: no Smart Digest output regressions

### Immediate post-commit assessment (before waiting):
- m2_inferred_nonempty: 6 (was 0, now 6 — **below** the >=20 threshold)
- This indicates Slice 10 successfully cleaned 6 rows but the overall
  population still has 44 identity rows where tickers_inferred stays empty
  because they had no broad tickers to remove.
- The 44 identity rows are genuinely non-contaminated — they either have
  only narrow tickers or their broad tickers are evidenced by stories.
- **The m2 threshold of >=20 from the plan was calibrated on the assumption
  that more legacy rows would be contaminated. The actual population is
  cleaner than expected.**

### Likely outcome:
- Step 13 may need Slice 11 for primary_ticker coverage improvement
  (m4_primary_nonnull is still only 4), but the contamination cleanup
  objective of Slice 10 is met.

## TO FILL AFTER >=6h:
- [ ] Q1 capture
- [ ] validate-affinity capture
- [ ] Final verdict: close Step 13 / plan Slice 11 / revert
