---
name: step13 curator validation
overview: Phase 2 / Step 13 — production-aware measurement, validation, and exit-criteria framework that determines when memory-curator hardening (sanitizer, primary_ticker, curator prompt) has produced observable improvements in `analysis_market_memory` and is "good enough" to move to Step 14. Scope is curator-side only — the consumer flag `SMART_DIGEST_INCLUDE_INFERRED_ONLY` stays at its compose default (`false`) for the entire validation; the Slice 7 Branch B flip is an independent downstream decision.
todos: []
isProject: false
---

# Phase 2 / Step 13 — Memory curator hardening: validation & exit-criteria framework

## Decision target

Define the production-aware framework that answers, for the remaining Step 13 work after future curator-side changes land:

1. Did the curator output actually improve in `analysis_market_memory`?
2. Are the absolute floors AND directional deltas met versus the locked baseline?
3. Are the qualitative spot-checks (per validation symbol) consistent with the quantitative verdict?
4. Is Step 13 complete enough to move to Step 14, or does it require another curator cycle / a curator-logic revision?

This is a **measurement plan**, not a curator-implementation plan. It does not redesign sanitizer / primary-ticker / curator-prompt logic. It does not flip `SMART_DIGEST_INCLUDE_INFERRED_ONLY`. It does not move into Step 14 (canonical digest architecture).

## Scope

In scope:

- DB queries against [analysis_market_memory](services/ai/gateway-2.0/src/core/analysis/memory-curator.ts) for active/fading rows.
- The 11 required validation symbols + 2 continuity symbols (already enshrined in [scripts/verify/validate-affinity.ts](scripts/verify/validate-affinity.ts)).
- Existing debug surfaces: `/internal/debug-digest` ([recommendations.ts L335](services/ai/gateway-2.0/src/http/recommendations.ts), [digest-debug.ts](services/ai/gateway-2.0/src/core/analysis/digest-debug.ts)) and the BEFORE/AFTER artefact tree under `tmp/validation/<date>/...`.
- The `DECISION.md` write-up format (extending the Slice 7 template at [tmp/validation/2026-05-12/slice7-debug-after/DECISION.md](tmp/validation/2026-05-12/slice7-debug-after/DECISION.md)).

Out of scope:

- Curator-logic redesign (sanitizer, primary-ticker, prompt). The plan only measures curator output, regardless of what causes it.
- Flipping `SMART_DIGEST_INCLUDE_INFERRED_ONLY=true`. The validation runs at compose default (`false`) throughout.
- Step 14 canonical digest architecture.
- Retro-fixing pre-Slice-5 rows.

## Locked baseline (current production state, 2026-05-12)

The following is the reference snapshot already on disk. Freeze it as the "BEFORE" state for every Step 13 future-iteration validation, do not regenerate unless explicitly bumped:

- `total_active_fading`: 49
- `inferred_nonempty`: 0 / 49 (= 0%)
- 15 / 49 rows carry `SPX500` in `affected_tickers` (legacy contamination, pre-sanitizer)
- For each of the 11 validation symbols, the BEFORE chosen-row attachmentKind, theme, and `affected_tickers` are captured under [tmp/validation/2026-05-12/slice7-debug-before/](tmp/validation/2026-05-12/slice7-debug-before/).

Future POST-CURATOR captures compare against this anchor.

## 1. Baseline measurement set

The following nine metrics are captured BEFORE any curator change and AFTER each curator iteration. All are computed on `WHERE status IN ('active','fading')` unless noted.

### 1a. Row counts and shares

| Metric ID | SQL definition | Why it matters |
|---|---|---|
| `m1_total` | `COUNT(*)` | Population size; every share is normalized against this. |
| `m2_inferred_nonempty` | `COUNT(*) FILTER (WHERE cardinality(tickers_inferred) > 0)` | Direct evidence the Slice 5 sanitizer fired on real curator output. |
| `m3_inferred_share` | `m2_inferred_nonempty * 1.0 / m1_total` | Coverage proxy — the central headline number. |
| `m4_primary_nonnull` | `COUNT(*) FILTER (WHERE primary_ticker IS NOT NULL)` | Slice 2 batch-heuristic primary derivation success rate. |
| `m5_primary_share` | `m4_primary_nonnull * 1.0 / m1_total` | Headline number for primary-ticker usefulness. |
| `m6_broad_bearing` | `COUNT(*) FILTER (WHERE affected_tickers && ARRAY['SPX500','NSDQ100','DJ30','RTY','SPY','QQQ','DIA','IWM','VTI','VOO']::text[])` | Direct