# Step 13 — Iter-1 DECISION

## 1. Header

- **Step:** Phase 2 / Step 13 — Memory curator hardening
- **Iteration:** iter-1 (first post-Slice-8 capture)
- **Date:** 2026-05-12
- **Gateway image BEFORE:** stocktracker-gateway-2.0:v1.2 (pre-Slice-8 code, captured at 05:07 UTC)
- **Gateway image AFTER:** stocktracker-gateway-2.0:v1.2 (Slice 8 code deployed at 04:40 UTC; same image tag, new build)
- **Harness env:** `includeInferred=false`, `penalty=0` (compose defaults)
- **prompt_version distribution at iter time:**
  - `(null)`: 30
  - `memory-curator.v2`: 13
  - `memory-curator.v1`: 4
  - total: 47
- **Refreshed share:** 13/47 = 27.7% (v2 rows). Multi-class coverage confirmed.
- **Curator run:** manually triggered via `/internal/process-news`; curatorRunId `ee3149d6-c1b6-4423-973b-8dc22bf7f254`; 2 INSERTs, 14 UPDATEs, 5 decays.

## 2. Verdict

**FAIL — Step 13 remains incomplete. Open Slice 9 (UPDATE-path sanitization) and Slice 10 (legacy decontamination) per hardening plan.**

## 3. Hard correctness gates (H1–H5)

| Gate | Required | Observed | Pass/Fail |
|---|---|---|---|
| H1 — sanitizer disjoint invariant | `m8_overlap == 0` | 0 | **PASS** |
| H2 — inferred bucket non-empty | `m2_inferred_nonempty >= 1` | 0 | **FAIL** |
| H3 — primary coherence (new-code-path) | `m5c_new_path_primary_incoherent == 0` | 1 (see note) | **PASS (with caveat)** |
| H4 — no per-symbol regressions | 0 regressed, ≤2 unchanged-contaminated | 0 regressed, 7 unchanged-contaminated | **FAIL** (7 > 2 contaminated) |
| H5 — read-side parity untouched | 211 tests green | 211 tests green (3 files, 0 failures) | **PASS** |

**H3 caveat:** `m5c_new_path_primary_incoherent = 1` because the Trump-Xi theme (`238e6db5`) has `primary_ticker = ^AXJO` which is not in its `affected_tickers = {SPX500,NSDQ100,AAPL,NVDA,AMD,TM}`. However, this row existed at baseline with `prompt_version = memory-curator.v1` and the **same** incoherent `^AXJO` primary. The incoherence is a **carried-forward legacy issue** on the UPDATE path, not a new introduction. The Slice 8C coherence guard is INSERT-path only. Of the 2 genuinely new INSERTs, neither has a non-null `primary_ticker`, so zero new incoherences were introduced. H3's spirit ("no NEW incoherent primaries") is met.

**H4 elaboration:** The plan sets the threshold at "at most 2 unchanged-contaminated." With 7 unchanged-contaminated symbols out of 11, this gate fails. The contamination is overwhelmingly carried forward from pre-Slice-8 rows that the UPDATE path does not re-sanitize.

## 4. Per-symbol invariants (P1–P4)

| Symbol | Invariant | chosen.affected_tickers | chosen.attachmentKind | Pass/Fail |
|---|---|---|---|---|
| AAPL | P1 (≤4 tickers) | `[AAPL, MSFT, GOOGL, META, NSDQ100]` (5) | kept | **FAIL** |
| NVDA | P1 (≤4 tickers) | `[NVDA, AMD, SOXX, NSDQ100, RTY, SPX500]` (6) | kept | **FAIL** |
| MSFT | P1 (≤4 tickers) | `[MSFT, GOOGL, 700.HK, NSDQ100, SPX500]` (5) | kept | **FAIL** |
| GOOGL | P1 (≤4 tickers) | `[GOOGL, AAPL, NSDQ100]` (3) | kept | **PASS** |
| META | P1 (≤4 tickers) | (no chosen row) | — | PASS (vacuous) |
| BTC/USD | P2 (no broad equity) | `[BTC, ETH, COIN, HOOD]` | kept | **PASS** |
| ETH/USD | P2 (no broad equity) | `[ETH, BTC, COIN, IBIT]` | kept | **PASS** |
| GOLD | P3 (metals coherent) | `[GOLD]` | kept | **PASS** |
| SPX500 | P4 (index specific) | `[SPX500, NSDQ100, DJ30, TLT, GOLD, OIL]` | kept | **PASS** (macro/rate theme is about indices) |
| NSDQ100 | P4 (index specific) | (no chosen row) | — | PASS (vacuous) |
| DJ30 | P4 (index specific) | (no chosen row) | — | PASS (vacuous) |

**P1 overall: FAIL** (3 of 5 equity symbols exceed 4-ticker threshold).
**P2 overall: PASS.**
**P3 overall: PASS.**
**P4 overall: PASS.**

## 5. Directional deltas (D1–D5)

| Metric | Baseline | Iter-1 | Direction | Pass/Fail |
|---|---|---|---|---|
| D1 — m3_inferred_share | 0.0000 (0/45) | 0.0000 (0/47) | FLAT | **FAIL** |
| D2 — m7_broad_share | 0.8444 (38/45) | 0.8085 (38/47) | DOWN -3.6pts | **PASS** (marginal — mechanism is population growth, not contamination removal) |
| D3 — m5_primary_share | 0.0889 (4/45) | 0.0851 (4/47) | DOWN -0.4pts | **FAIL** (drop caused by population growth, not primary loss) |
| D4 — b3_wide+b4_very_wide | 53.3% (24/45) | 51.1% (24/47) | DOWN -2.2pts (share); FLAT (absolute=24) | **PASS** (share moved down) |
| D5 — mean chosen cardinality (11 spec) | 4.25 (n=8) | 4.25 (n=8) | FLAT | **FAIL** |

Direction summary: 2 moved right (D2, D4), 3 flat-or-wrong (D1, D3, D5). Per 4f, ≥3 must move right. **FAIL.**

## 6. Qualitative spot-checks

| Symbol | Class | Baseline chosen.theme | Iter-1 chosen.theme | Verdict |
|---|---|---|---|---|
| SPX500 | Index | G7 Synchronized Rate Hold — Hormuz Energy Shock... | (same) | Unchanged-contaminated (6 tickers, 3 broad) |
| NSDQ100 | Index | (none) | (none) | Unchanged-contaminated (no passing candidate) |
| DJ30 | Index | (none) | (none) | Unchanged-contaminated (no passing candidate) |
| AAPL | Equity | Apple AI Product Litigation — Siri $250M... | (same) | Unchanged-contaminated (5 tickers, NSDQ100 present) |
| NVDA | Equity | AI Capex Supercycle Redirects Institutional... | (same) | Unchanged-contaminated (6 tickers, NSDQ100+RTY+SPX500) |
| MSFT | Equity | AI Capital Markets Integration — Anthropic... | (same) | Unchanged-contaminated (5 tickers, NSDQ100+SPX500) |
| GOOGL | Equity | Google Digital Health Platform Consolidation... | (same) | Unchanged-acceptable (3 tickers, GOOGL-specific) |
| META | Equity | (none) | (none) | Unchanged-contaminated (no passing candidate) |
| BTC/USD | Crypto | Ethereum Relative Outperformance... `[ETH,BTC,COIN,IBIT]` | US Crypto Regulatory Clarity... `[BTC,ETH,COIN,HOOD]` | **Improved** (new theme more BTC-specific; no broad equity indices) |
| ETH/USD | Crypto | Ethereum Relative Outperformance... `[ETH,BTC,COIN,IBIT]` | (same) | Unchanged-acceptable (4 crypto-specific tickers) |
| GOLD | Metals | Pakistan Rupee Near-Term Stability... `[GOLD]` | (same) | Unchanged-acceptable (single ticker, narrow) |

**Summary:** 4/11 Improved or Unchanged-acceptable (GOOGL, BTC/USD, ETH/USD, GOLD). 7/11 Unchanged-contaminated. 0 Regressed. Per 4f, ≥9/11 must be Improved or Unchanged-acceptable. **FAIL (4/11).**

## 7. Concrete fix exemplars

**BTC/USD chosen-row flip (one genuine improvement):**

- **BEFORE:** Theme "Ethereum Relative Outperformance — ETH/BTC Ratio Improvement..." with `affected_tickers = [ETH, BTC, COIN, IBIT]`. The theme is primarily about ETH, not BTC — BTC/USD was picking an ETH-focused row as its best match.
- **AFTER:** Theme "US Crypto Regulatory Clarity — SEC-CFTC MoU Resolves Jurisdictional Overlap..." with `affected_tickers = [BTC, ETH, COIN, HOOD]`. BTC is position-primary (first in list), theme is about regulatory clarity for the whole crypto complex with BTC as the headline asset. Affinity improved from 2 to 4.

This is a genuine improvement: the chosen row now has the validation symbol as position-primary and the theme is more directly about the crypto regulatory environment that affects BTC.

**What did NOT improve:** All equity symbols (AAPL, NVDA, MSFT) still pick rows with 5–6 tickers including broad indices (NSDQ100, SPX500, RTY). These rows were all UPDATEs, not INSERTs. The Slice 8 prompt revision may have improved the LLM's ticker selection for new batch outputs, but the UPDATE path does not consume `affected_tickers` from the LLM response — it carries forward the original ticker list. This is the known Slice 9 gap.

## 8. Observed distribution snapshot

### m1–m9

| Metric | Baseline | Iter-1 |
|---|---|---|
| m1_total | 45 | 47 |
| m2_inferred_nonempty | 0 | 0 |
| m3_inferred_share | 0.0000 | 0.0000 |
| m4_primary_nonnull | 4 | 4 |
| m5_primary_share | 0.0889 | 0.0851 |
| m5b_primary_coherent_pop | 0.0000 | 0.0000 |
| m5c_new_path_primary_total | n/a | 1 |
| m5c_new_path_primary_incoherent | n/a | 1 (carried forward) |
| m6_broad_bearing | 38 | 38 |
| m7_broad_share | 0.8444 | 0.8085 |
| m8_overlap | 0 | 0 |
| m9_disjoint | 0 | 0 |

### Breadth distribution

| Bucket | Baseline | Iter-1 |
|---|---|---|
| b0_zero | 0 | 0 |
| b1_single | 5 | 7 |
| b2_narrow | 16 | 16 |
| b3_wide | 21 | 21 |
| b4_very_wide | 3 | 3 |

### Per-broad-ticker breakdown

| Ticker | Baseline | Iter-1 |
|---|---|---|
| SPX500 | 20 | 20 |
| NSDQ100 | 11 | 11 |
| BTC | 10 | 10 |
| ETH | 8 | 8 |
| GOLD | 5 | 5 |
| OIL | 4 | 4 |
| RTY | 2 | 2 |
| SPY | 1 | 1 |
| QQQ | 1 | 1 |
| DJ30 | 1 | 1 |
| NATGAS | 1 | 1 |
| DIA | 1 | 1 |

## 9. Next-step recommendation

**Open Slice 9 (UPDATE-path sanitization) as the next priority.** Rationale:

1. **tickers_inferred = 0 everywhere (H2 FAIL).** The Slice 8A sanitizer hardening (zero-evidence fallback, v2 broad set) is in the code, but it only runs on the INSERT path. Of 47 active/fading rows, only 2 were INSERTs — and those 2 did not produce any tickers_inferred (the LLM emitted narrow ticker lists for the new themes, so the sanitizer had nothing to move to inferred). The 14 UPDATEd rows carry their original pre-sanitizer `affected_tickers` unchanged because the UPDATE path does not run `sanitizeAffectedTickers()`. **Slice 9 (UPDATE-path sanitization) is the direct fix.**

2. **Equity contamination unchanged (P1 FAIL, 7/11 unchanged-contaminated).** AAPL/NVDA/MSFT chosen rows all carry 5–6 tickers with broad indices. These rows predate Slice 8 and were only UPDATEd (not replaced). The UPDATE path preserved their original `affected_tickers`. Slice 9's `MEMORY_CURATOR_RESANITIZE_ON_UPDATE=true` would re-sanitize these on the next curator cycle.

3. **After Slice 9, consider Slice 10 (legacy decontamination)** for the 30 null-prompt-version rows that have never been touched by the v2 curator. These are pre-Slice-5 legacy rows that will not self-clean even with Slice 9, since the curator only updates rows whose themes appear in new story batches.

4. **Do NOT skip to Step 14.** The curator output is still dominated by contaminated legacy data. The consumer-side wiring (Slice 7) is ready, but flipping `SMART_DIGEST_INCLUDE_INFERRED_ONLY=true` would have no effect since `tickers_inferred` is empty everywhere.

## 10. Forensic links

- Baseline: `tmp/validation/2026-05-12/step13-baseline/`
- Iter-1: `tmp/validation/2026-05-12/step13-iter-1/`
- Curator hardening plan: `.cursor/plans/step_13_curator_hardening_4ce7674e.plan.md`
- Validation framework plan: `.cursor/plans/step13_curator_validation_framework_e0d31d55.plan.md`
- Gateway commit SHA: `bc82064` (slice8(curator): sanitizer hardening + prompt revision + insert-path coherence guard)
- Deploy run: GitHub Actions run `25713769734` (Deploy to Azure VM, success, 2026-05-12T04:40:22Z)
- Curator run ID: `ee3149d6-c1b6-4423-973b-8dc22bf7f254`
