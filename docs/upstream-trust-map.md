# Upstream Trust Map

Field-by-field trust classification for the three analysis tables that feed Smart Digest.

## `analysis_filtered_news`

Writer: `services/ai/gateway-2.0/src/core/analysis/news-processor.ts`
Migration: `013_add_filtered_news.sql` + `025_filtered_news_provenance.sql` + `027_filtered_news_primary_ticker.sql` (+ view extension `029_unfiltered_news_combined_with_entities.sql`)

| Column | Class | Notes |
|---|---|---|
| `id`, `processed_at`, `created_at` | deterministic | DB defaults |
| `batch_id` | deterministic | `randomUUID()` per run |
| `time_range_start` / `time_range_end` | deterministic | batch-wide, not per-story |
| `headline` | LLM synthesis | prompt asks <=120 chars, not enforced |
| `summary` | LLM synthesis | no length cap |
| `category` | LLM, coerced | falls back to `"market"` |
| `impact_level` | LLM, coerced | falls back to `"medium"` |
| `affected_sectors` | LLM | string-array filter |
| `affected_tickers` | LLM | uppercased; validated against universe (unknowns stored in `tickers_unknown`) |
| `sentiment` | LLM, coerced | falls back to `"neutral"` |
| `sentiment_score` | LLM, clamped | `[-1, 1]` |
| `key_points` | LLM | required non-empty array |
| `market_implications` | LLM or `""` | |
| `source_articles` (JSONB) | hybrid | LLM picks indices, code maps to `{source_api, external_id, title, published_at, url}` |
| `model_name` | deterministic | hardcoded model string |
| `prompt_version` | deterministic | `"news-processor.v1"` |
| `validator_version` | deterministic | `"news-processor.zod.v1"` |
| `generated_at` | deterministic | server timestamp after LLM returns |
| `tickers_unknown` | deterministic | tickers not found in `stock_tickers` / `crypto_tickers` |
| `primary_ticker` | **deterministic from source** | Slice 2: single subject ticker derived from MarketAux `entities.match_score`; NULL when no MarketAux entity signal available |
| `primary_ticker_source` | deterministic | `"marketaux_entities"` (strong tier) or NULL (none tier). `"batch_heuristic"` is invalid on this table |

## `analysis_market_memory`

Writer: `services/ai/gateway-2.0/src/core/analysis/memory-curator.ts`
Migration: `015_add_market_memory.sql` + `024_market_memory_news_one_liner.sql` + `026_market_memory_provenance.sql` + `028_market_memory_primary_ticker.sql`

| Column | Class | Notes |
|---|---|---|
| `id`, `created_at` | deterministic | DB defaults |
| `theme_id` | deterministic | `randomUUID()` |
| `status` | deterministic | `active` on write; rule-based `fading`/`archived` |
| `relevance_score` | hybrid | fixed 1.000 on insert; LLM-driven on updates; decayed deterministically |
| `first_observed`, `last_updated` | deterministic | server `now` |
| `update_count` | deterministic | starts at 1, +1 per update |
| `source_batch_ids` | deterministic | UUID set of batch_ids from filtered rows |
| `price_snapshot_at`, `ticker_prices_at_creation` | deterministic | snapshot from price targets |
| `theme` | LLM | |
| `summary` | LLM | |
| `key_facts` | LLM | new facts appended via PG array concat |
| `category` / `impact_level` | LLM, coerced | drives macro template and gates |
| `affected_sectors` | LLM | |
| `affected_tickers` | LLM | validated against universe (unknowns in `tickers_unknown` on insert) |
| `market_implications` | LLM | not displayed |
| `sentiment` / `sentiment_score` | LLM, coerced/clamped | |
| `news_one_liner` | LLM | 200-char trimmed; prompt says 140 |
| `model_name` | deterministic | curator model name, overwritten on update |
| `prompt_version` | deterministic | `"memory-curator.v1"`, overwritten on update |
| `validator_version` | deterministic | `"memory-curator.zod.v1"`, overwritten on update |
| `generated_at` | deterministic | server timestamp, overwritten on update |
| `tickers_unknown` | deterministic | set on insert only; not updated since tickers don't change on update |
| `primary_ticker` | **deterministic but heuristic** | Slice 2: majority-vote primary across filtered-news rows in the same batch whose `affected_tickers` overlap this theme; NULL when no overlap or all overlapping primaries are NULL |
| `primary_ticker_source` | deterministic | `"batch_heuristic"` (heuristic tier) or NULL (none tier). `"marketaux_entities"` is invalid on this table. **Set on INSERT only — never mutated on UPDATE** (anchor invariance) |

## `analysis_ticker_price_targets`

Writer: `services/workers/data-fetcher-2.0/.../PriceTargetRepository.cs`
Migrations: `007`, `009`, `011`

**Fully deterministic.** All columns computed in C# from candlestick patterns + indicators + lookup parameters. No LLM touches this path.

## How provenance fields are populated

On every `news-processor.ts` and `memory-curator.ts` run:

1. The LLM call produces raw JSON; a Zod schema (`llm-schemas.ts`) validates each entry with the same coercion/clamping as the prior manual validators.
2. `generated_at` is captured as `new Date().toISOString()` immediately after the LLM returns.
3. All `affected_tickers` across the batch are validated against `stock_tickers UNION crypto_tickers` via `provenance.ts:validateTickersAgainstUniverse`. Unknown tickers are stored in `tickers_unknown` per row but **not removed** from `affected_tickers` — this is observability only.
4. `model_name`, `prompt_version`, and `validator_version` are written to each row so regressions can be attributed to a specific model or prompt change.
5. For `analysis_market_memory` updates, `model_name`, `prompt_version`, `validator_version`, and `generated_at` are overwritten to reflect the most recent LLM author. `tickers_unknown` is not updated because the UPDATE path does not mutate `affected_tickers`.

## Where LLM touches the pipeline (exhaustive)

- `news-processor.ts` → `cursor-agent --model claude-4.6-sonnet-medium` (180s timeout, 75-article cap)
- `memory-curator.ts` → `cursor-agent --model <CURATOR_MODEL>` (configurable timeout, 25-story cap)

Everything downstream of `analysis_market_memory` is template-driven in TS. The digest brief is **not** LLM-generated.

## Highest risks for Smart Digest quality

1. **Ticker hallucination** — `affected_tickers` is the join key for symbol overlap; `tickers_unknown` observability now enables sizing this risk.
2. **`news_one_liner`** — only LLM string surfaced verbatim on cards; no factuality enforcement.
3. **Primary-subject vs mentioned-ticker distinction** — Slice 2 landed a deterministic `primary_ticker` on filtered news (strong tier) and a batch-heuristic primary on memory (heuristic tier). Slice 3 adopted these in `computeSymbolAffinity` via a trust-tier-weighted mutex that replaces the implicit `affected_tickers[0]` heuristic when upstream signal is available. See "Consumer adoption (Slice 3)" below for details.
4. **Memory lineage is batch-coarse** — `source_batch_ids` only, no per-row attribution. Deferred.

## Slice 2: primary subject ticker

### Trust tiers (read this first)

| `primary_ticker_source` value | Trust tier | Appears on | How derived | How a consumer should use it |
|---|---|---|---|---|
| `"marketaux_entities"` | **strong** | `analysis_filtered_news` only | Deterministic from MarketAux `entities[].match_score` at news-processor write time. No LLM involved. | Safe to treat as ground truth in downstream gating. |
| `"batch_heuristic"` | **heuristic** | `analysis_market_memory` only | Deterministic majority vote at curator write time over `primary_ticker` of filtered-news rows whose `affected_tickers` overlap the new theme. Reproducible from the same batch but **not source-grounded** at the memory layer. | Safe as a tie-breaker or weighted signal; **not** safe as ground truth. |
| `NULL` | **none** | both tables | No deterministic signal available (e.g. GNews-only story, or no overlapping primaried filtered rows). | Fall back to existing logic (`affected_tickers[0]` heuristic + text-token affinity). |

Trust ordering for any future consumer is `strong > heuristic > none`. Slice 3 adoption code must respect that ordering and weight on the source value, not just on non-NULL-ness.

### Derivation rules (copied from `primary-ticker.ts` JSDoc)

- `computeArticlePrimary` (per raw article): only MarketAux articles produce a non-NULL result. Sort entities by `(match_score DESC, symbol ASC)` and take the first; uppercase the symbol.
- `computeStoryPrimary` (per LLM-grouped story): drop article primaries that are NULL; majority-vote the remainder; break ties alphabetically. Source is `marketaux_entities` whenever the result is non-NULL.
- `computeMemoryPrimary` (per memory theme at INSERT): consider only contributing filtered-news rows whose `affected_tickers` (uppercased) overlap the theme's `affected_tickers`. Drop those whose `primary_ticker` is NULL. Majority-vote; break ties alphabetically. Source is `batch_heuristic` whenever the result is non-NULL.

All three functions are pure and wrapped in try/catch — on any internal failure they return `{ null, null }` so writes are never blocked.

### Debug surface

Each memory candidate in `digest-debug.ts`'s report carries a `primaryTicker` block:

```ts
primaryTicker: {
  ticker: string | null;
  source: "marketaux_entities" | "batch_heuristic" | null;
  trustTier: "strong" | "heuristic" | "none";  // derived from source via trustTierOf
}
```

The `trustTier` field is the canonical thing a debug reader should key off; the raw `source` is kept for forensic completeness. `fetchMemoryCandidatesForDebug` logs an invariant warning if a memory row carries `marketaux_entities` (only valid on filtered news) — the source is preserved unchanged, only flagged.

### Consumer adoption (Slice 3 — landed)

`computeSymbolAffinity` in `digest-symbol-affinity.ts` now scores `primary_ticker` per trust tier via a **mutex** with the legacy position-primary heuristic:

- When `primary_ticker_source` is non-null, the scorer uses `primary_ticker` as the subject signal and **skips** the `affected_tickers[0]` positional fallback entirely. No double-counting.
- When `primary_ticker_source` is null/undefined, the legacy `WEIGHT_POSITION_PRIMARY` (+2 for `affected_tickers[0]` alias match) fires unchanged.

**Weight values:**

- `"marketaux_entities"` (strong) match: **+3** (`WEIGHT_PRIMARY_TICKER_STRONG`)
- `"batch_heuristic"` (heuristic) match: **+2** (`WEIGHT_PRIMARY_TICKER_HEURISTIC`)
- Non-null source, no alias match: **+0** (no penalty this slice)
- `NULL` source: legacy position-primary (+2 on hit, +0 on miss)

**New reason codes in `affinity.reasons`:**

- `primary_ticker_hit:strong:TICKER` / `primary_ticker_hit:heuristic:TICKER` — subject signal matched the digest alias set.
- `primary_ticker_miss:strong:TICKER` / `primary_ticker_miss:heuristic:TICKER` — subject signal did not match (or `primary_ticker` was null with non-null source).
- `position_primary_hit:*` / `position_primary_miss:*` — only appears when source is NULL (fallback path).

**Plumbing:** `recommendation-engine.ts` (`fetchTickerMemoryText`, `fetchNewsHeadlines`) and `digest-debug.ts` (`fetchMemoryCandidatesForDebug`) all SELECT `primary_ticker, primary_ticker_source` and pass them through `coercePrimaryTickerSource` (canonical shared coercer in `primary-ticker.ts`) into the scorer.

**What is NOT changed in Slice 3:**

- `compareMemoryCandidates` ranking ordering, surfacing thresholds, `decideSurfacing`, and the brief generator are untouched. Score changes flow through the existing ranking key.
- No negative penalty on a strong-tier mismatch (deferred to Slice 4 after observing real distributions).
- `WEIGHT_POSITION_PRIMARY` is kept active for the NULL-source fallback path. The old heuristic is not deleted.

### Future work (Slice 5+)

- (a) **Expand coverage**: deterministic NER on GNews titles (no LLM) to populate `primary_ticker` for GNews-only stories.
- (b) **Tighten the prompt**: ask the LLM for a `primary_ticker` output field — but only after Slice 2/3 data shows whether the model agrees with the MarketAux-deterministic primary on ground-truth rows.
- (c) **Heuristic-tier mismatch penalty**: if future data shows `batch_heuristic` mismatches reliably predict contamination, add a small negative weight. Evidence-based decision to defer: see Slice 4 rationale below.

## Slice 4: trust-aware primary-ticker mismatch penalty

### What changed

Slice 3 introduced trust-tier-aware scoring for `primary_ticker` but treated all mismatches as +0 (no bonus, no penalty). Slice 4 adds a **negative penalty** specifically on **strong-tier mismatches** — cases where `primary_ticker_source = "marketaux_entities"` and `primary_ticker` is non-null but does not match the digest symbol's alias set.

### New constant

`WEIGHT_PRIMARY_TICKER_STRONG_MISS = -2` in `digest-symbol-affinity.ts`.

### Updated scoring table

| Case | Weight | Reason code |
|---|---|---|
| Strong primary hit (`marketaux_entities`, ticker matches alias) | `+3` | `primary_ticker_hit:strong:<T>` |
| Strong primary miss (`marketaux_entities`, ticker != alias, ticker non-null) | **`-2`** | `primary_ticker_miss:strong:<T>` |
| Strong primary unknown (`marketaux_entities`, ticker is null) | `0` | `primary_ticker_unknown:strong` |
| Heuristic primary hit (`batch_heuristic`, ticker matches alias) | `+2` | `primary_ticker_hit:heuristic:<T>` |
| Heuristic primary miss (`batch_heuristic`, ticker != alias, ticker non-null) | `0` | `primary_ticker_miss:heuristic:<T>` |
| Heuristic primary unknown (`batch_heuristic`, ticker is null) | `0` | `primary_ticker_unknown:heuristic` |
| NULL source (fallback) | `+2` hit / `0` miss | `position_primary_hit/miss:*` |

### New reason codes

- `primary_ticker_unknown:strong` / `primary_ticker_unknown:heuristic` — upstream tagged itself with a source but produced a null primary ticker. Distinguishes "no data" from "identified a different ticker". No penalty applied; serves as a data-integrity monitoring flag.

### Why -2 for strong miss

The `-2` exactly cancels `WEIGHT_TEXT_TOKEN` (+2). This means a row that incidentally text-mentions a symbol (e.g. "ETH/BTC Ratio" mentioning BTC in a metric name) but whose upstream source-grounded primary is a *different* symbol (ETH) lands at score 0 — below the default threshold of 2. The contamination scenario:

| Signal | Score |
|---|---|
| `text_token_hit:BTC` | +2 |
| `primary_ticker_miss:strong:ETH` | -2 |
| `normal_tag:n=4` | 0 |
| **Total** | **0 → rejected** |

Without the penalty (Slice 3), the same row scored 2 and passed — contaminating the BTC digest with an ETH-primary row.

### Why 0 for heuristic miss

Evidence-based decision. Only one `batch_heuristic` mismatch was observed in production data at the time of this decision: NVDA's KOSPI theme with `primary_ticker = "^FCHI"`. That row was already correctly rejected at score 0 without any penalty (text miss + heuristic miss 0 + normal_tag 0 = 0). The heuristic primary itself can be wrong (e.g. `^FCHI` for a Korean equities theme), so penalizing it risks regressing clearly on-symbol rows where the curator's batch vote was inaccurate. Revisit once more heuristic-miss data accumulates.

### Why split _miss vs _unknown

Slice 3 emitted `primary_ticker_miss:strong:null` when `primary_ticker_source` was non-null but `primary_ticker` was null. That conflated two semantically different cases: "upstream positively identified a different ticker" (should penalize) vs "upstream tagged itself but had no data" (data integrity edge case, should not penalize). The `_unknown` code makes this distinction explicit in debug output and ensures the `-2` penalty fires only on positive mismatch.

### Reversibility

Single-line revert of `WEIGHT_PRIMARY_TICKER_STRONG_MISS` from -2 to 0 restores Slice 3 behavior exactly. No migration, no schema change, no upstream layer touched.

---

## Slice 6 — Consumer adoption of `tickers_inferred`

**Decision target:** Make the Smart Digest consumer-side scorer aware of `analysis_market_memory.tickers_inferred` (populated by the Slice 5 INSERT-time sanitizer) so that inferred-only ticker attachment is distinguishable, debuggable, and discountable.

### What changed

1. **Attachment classification** — every `(row, symbol)` affinity evaluation now classifies an `attachmentKind`:

| Kind | Condition | Behaviour |
|---|---|---|
| `kept` | Symbol is in `affected_tickers` | Normal scoring (unchanged) |
| `inferred_only` | Symbol is only in `tickers_inferred` | Skips position-primary / primary-ticker branches; applies configurable penalty |
| `both` | Symbol is in both arrays | Treated as `kept` (defensive; should not occur post-Slice-5) |
| `none` | Symbol is in neither array | Normal scoring (unchanged) |

2. **New reason code families:**

| Code | When emitted |
|---|---|
| `inferred_ticker_present:<T>` | For every entry in `tickers_inferred` (always, for inspectability) |
| `attachment_inferred_only:<ALIAS>` | When `attachmentKind === "inferred_only"` (replaces position/primary branches) |

3. **New environment knob:**

| Variable | Default | Clamp range | Effect |
|---|---|---|---|
| `SMART_DIGEST_INFERRED_ONLY_PENALTY` | `0` | `[-5, 0]` | Score penalty applied once when `attachmentKind === "inferred_only"`. At default `0`, no behavior change. |

4. **Debug surface** — `DebugMemoryCandidate` now exposes `tickersInferred: string[]` and `attachmentKind`.

### Scoring behaviour for `inferred_only`

When the digest symbol is only present via `tickers_inferred`:

- `WEIGHT_POSITION_PRIMARY`, `WEIGHT_PRIMARY_TICKER_STRONG`, `WEIGHT_PRIMARY_TICKER_HEURISTIC`, and `WEIGHT_PRIMARY_TICKER_STRONG_MISS` are **all skipped** — these weights are meaningless because the symbol was dropped from `affected_tickers` by the sanitizer.
- `getInferredOnlyPenalty()` is applied once (default `0`).
- Text-token and cardinality-shaping weights still fire normally.

### SQL filter unchanged

The `affected_tickers && $1::text[]` filter in `fetchTickerMemoryText` and `fetchNewsHeadlines` is **not** expanded to include `tickers_inferred` in Slice 6. This is deliberate — opening the filter is a Slice 7 candidate once data and scoring evidence exist.

### Reversibility

- Remove the `inferred_only` branch and revert `attachmentKind` to always `"none"` — single code block.
- Set `SMART_DIGEST_INFERRED_ONLY_PENALTY=0` (or unset it) to disable the penalty at runtime without any code change.

---

## Slice 7 — Inferred-only tuning + env-gated candidate inclusion

**Decision target:** Ship the penalty compose-default (`-2`) and the env-gated SQL expansion (`SMART_DIGEST_INCLUDE_INFERRED_ONLY`, default `false`) as additive, reversible changes on top of Slice 6. The include flag stays dormant at default; its behavioral effect is only relevant when production data later contains non-empty `tickers_inferred` AND the flag is explicitly flipped on.

### Environment knobs

| Variable | Default | Clamp / validation | Effect |
|---|---|---|---|
| `SMART_DIGEST_INFERRED_ONLY_PENALTY` | `-2` (compose layer) | `[-5, 0]` clamped in `getInferredOnlyPenalty()` | Score penalty applied when `attachmentKind === "inferred_only"`. Source-level default remains `0`; the `-2` lives in `deployment/vm/docker-compose.yml` so revert is one line. |
| `SMART_DIGEST_INCLUDE_INFERRED_ONLY` | `false` (compose layer) | Truthy: `"true"` / `"1"` only; everything else is false | When true, fetchers also pull rows whose digest-symbol alias appears only in `tickers_inferred`. Default false — no behavior change until explicitly enabled. |

### SQL predicate shape per fetcher

All three fetchers use the canonical predicate:

```sql
(affected_tickers && $K::text[]
 OR ($I::bool AND tickers_inferred && $K::text[]))
```

Where `$K` is the existing alias-array parameter and `$I` is the newly-appended boolean flag.

| Fetcher | File | `$K` | `$I` | Params shape |
|---|---|---|---|---|
| `fetchTickerMemoryText` | `recommendation-engine.ts` | `$1` | `$3` | `[string[], number, boolean]` |
| `fetchNewsHeadlines` (with `symbolFilter`) | `recommendation-engine.ts` | `$2` | `$3` | `[number, string[], boolean]` |
| `fetchMemoryCandidatesForDebug` | `digest-debug.ts` | `$1` | `$2` | `[string[], boolean]` |

When `$I` is bound `false`, the OR-arm evaluates to `false` for every row, so the predicate reduces to the original `affected_tickers && $K::text[]` filter. Observable behavioral contract: at flag `false` the returned candidate set matches the Slice 6 default-path outcome, asserted by deep-equal tests.

### TS-side iteration changes

- `fetchTickerMemoryText`: inner per-digest hit-check probes both `row.affected_tickers` and `row.tickers_inferred` (when flag is true) before filtering.
- `fetchNewsHeadlines`: outer ticker loop iterates `[...keptTickers, ...inferredTickers]` where `inferredTickers` is empty when flag is false.
- `fetchMemoryCandidatesForDebug`: no TS iteration change needed (single-symbol scoring already handles classification via `computeSymbolAffinity`).

### Data-aware execution branches

- **Branch A (inferred_nonempty == 0):** No `inferred_only` candidates can appear regardless of flag state. Wiring ships dormant. Validation: BEFORE snapshot grep guard confirms zero `inferred_only` attachments; tests prove default-flag behavioral parity with Slice 6.
- **Branch B (inferred_nonempty > 0):** AFTER snapshot with flag=true + penalty=-2 enables the full before/after flip comparison. Regression guard: no symbol whose BEFORE chosen-row was `attachmentKind="kept"` may have its AFTER chosen-row become `attachmentKind="inferred_only"`.

### Reversibility

- `SMART_DIGEST_INFERRED_ONLY_PENALTY=0` + `SMART_DIGEST_INCLUDE_INFERRED_ONLY=false` (or unset both) returns the system to Slice 6 behavior exactly.
- The penalty value lives in the compose layer, not in source code. Revert is one line in `docker-compose.yml` or an Infisical override.
- The include flag defaults to `false` in compose; flipping to `true` requires explicit action via Infisical or compose override.

### Caveat

The include flag stays dormant by default and is only behaviorally relevant when production data contains non-empty `tickers_inferred` AND the flag is explicitly flipped on. Until both conditions hold, this slice ships dormant wiring and a stored-but-unreached penalty value.

---

## Slice 8 — Curator pollution gate hardening

Slice 8 addresses the curator-side bottleneck: `tickers_inferred ≈ 0` in production, low `primary_ticker` coverage on new rows, and broad-row contamination from the curator prompt. All changes are INSERT-time or pure-string; no UPDATE-path mutation semantics and no backfill. Those are deferred to Slices 9 and 10 respectively.

### 8A — Sanitizer hardening

**Broad set tiering.** The original `BROAD_INDEX_BOILERPLATE_TICKERS` (SPX500, NSDQ100, DJ30, RTY, SPY, QQQ, DIA, IWM, VTI, VOO) is preserved unchanged. A new `BROAD_MACRO_PROXY_TICKERS` (GOLD, OIL, NATGAS, BTC, BTC/USD, ETH, ETH/USD) is added alongside it. The active broad set is composed at runtime based on a tier env flag.

**Zero-evidence fallback.** Slice 5 returned the original unchanged when `evidencedUnion` was empty (no contributing stories overlapped). Slice 8 replaces this with a tiered rule:
- Theme is entirely broad → all tickers move to `tickers_inferred`, `affected_tickers = []`.
- Theme has at least one non-broad ticker → non-broad subset stays in `affected_tickers`, broad tickers move to `tickers_inferred`.

### 8B — Curator prompt revision

The `affected_tickers` instruction in `buildBatchCuratorPrompt()` was changed from "include at least one major index symbol for broad macro themes" to "include only the tickers that are the SUBJECT of the article." The explicit lists of broad index proxies and macro proxies are cited in the prompt as examples of what NOT to include unless the article is actually about that instrument.

`MEMORY_CURATOR_PROMPT_VERSION` bumped from `memory-curator.v1` to `memory-curator.v2`. All new rows record the new version in `prompt_version`, enabling A/B boundary queries in the DB.

### 8C — Primary-ticker coherence guard (INSERT path only)

After sanitization, if `computeMemoryPrimary` chose a primary that was dropped from `sanitization.kept`, both `primary_ticker` and `primary_ticker_source` are nulled before INSERT. Anchor invariance is preserved for the common case where the sanitizer kept everything.

The UPDATE path is intentionally untouched in Slice 8 — that belongs in Slice 9.

### Environment knobs

| Variable | Default | Values | Effect |
|---|---|---|---|
| `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS` | `true` (unchanged) | `"false"` disables | Disables the entire sanitizer (Slice 5 + 8). |
| `MEMORY_CURATOR_BROAD_TICKER_TIER` | `"v2"` | `"v1"` / `"v2"` | `v1` = legacy index set only. `v2` = union of index + macro-proxy. Unknown values default to `v2`. |

### Reversibility

| Action | Effect |
|---|---|
| `MEMORY_CURATOR_BROAD_TICKER_TIER=v1` | Reverts to Slice 5 broad set (legacy indexes only). Macro-proxy expansion disabled. |
| `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` | Reverts the entire sanitizer. All tickers pass through to `affected_tickers`. |
| Git revert of prompt change | Restores old prompt text. Rows already tagged `memory-curator.v2` remain queryable as the A/B boundary. |
| Git revert of coherence guard | Restores pre-Slice-8 behavior where `primary_ticker` can point outside `affected_tickers`. |

### What this slice intentionally does NOT do

- Does not change UPDATE-path mutation semantics (deferred to Slice 9).
- Does not run a backfill script on legacy rows (deferred to Slice 10).
- Does not change the consumer read path (`digest-symbol-affinity.ts`, `recommendation-engine.ts`, `digest-debug.ts`) — all read-side tests pass unchanged.

---

## Slice 9 — UPDATE-path sanitization

**Status:** deployed dormant (flag default `false`).

### Problem

Slice 8 only sanitizes `affected_tickers` on the INSERT path. The dominant curator write path is UPDATE — rows that the curator refreshes carry their pre-Slice-8 `affected_tickers` verbatim. iter-1 showed `tickers_inferred = 0 / 47` and 7/11 validation symbols still contaminated with broad indices in their UPDATEd rows.

### What Slice 9 does

When `MEMORY_CURATOR_RESANITIZE_ON_UPDATE=true` AND `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS` is not `false`, the `applyChanges` UPDATE branch:

1. Reads the existing row's `affected_tickers`, `primary_ticker`, `primary_ticker_source` inside the transaction (`SELECT … FOR UPDATE`).
2. Runs `sanitizeAffectedTickers(existingRow.affected_tickers, batchStories)` using the same sanitizer and evidence model as the INSERT path.
3. Writes `affected_tickers = san.kept`, `tickers_inferred = san.inferred` as additional SET clauses.
4. If the existing `primary_ticker` is no longer in `san.kept`, nulls `primary_ticker` and `primary_ticker_source` (guard-only — never recomputes via `computeMemoryPrimary`).

### Safety guards

- **No contributing stories** → sanitizer step skipped entirely; legacy UPDATE fires.
- **Existing list empty** → nothing to sanitize; legacy UPDATE fires.
- **Erasure guard** → if `san.kept` is empty AND existing list had non-broad tickers, treat as untrusted and no-op.
- **Identity guard** → if `san.kept` is set-equal to existing and `san.inferred` is empty, skip the extra SET clauses (avoids no-op writes).
- **Per-update try/catch** → any failure in the sanitization block logs a warning and falls through to the legacy UPDATE.

### Environment knobs

| Variable | Default | Values | Effect |
|---|---|---|---|
| `MEMORY_CURATOR_RESANITIZE_ON_UPDATE` | `"false"` | `"true"` enables | Enables UPDATE-path sanitization. Strict: only literal `"true"` (case-insensitive) activates it. |

Master kill switch `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` supersedes Slice 9 regardless of its own flag.

### Reversibility

| Action | Effect |
|---|---|
| `MEMORY_CURATOR_RESANITIZE_ON_UPDATE=false` | Reverts to Slice 8 UPDATE behavior. No redeploy. |
| `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` | Master kill switch — disables all sanitization (Slice 5 + 8 + 9). |

### What this slice intentionally does NOT do

- Does not change `ThemeUpdateEntry`, `themeUpdateEntrySchema`, or the curator prompt (no LLM contract change).
- Does not recompute `primary_ticker` via `computeMemoryPrimary` on UPDATE (guard-only).
- Does not run a backfill script on legacy rows (deferred to Slice 10).
- Does not change INSERT-path behavior (already shipped in Slice 8).
- Does not change the consumer read path — all read-side tests pass unchanged.

---

## Slice 10 — Legacy decontamination of `analysis_market_memory`

**Status:** one-shot operational script, not a permanent feature flag.

### Problem

Slice 8 fixed the INSERT path. Slice 9 fixed the UPDATE path. But rows whose themes no longer surface in fresh story batches are immortal — the curator never selects them for UPDATE, so Slice 9 never touches them. The 30+ null-`prompt_version` legacy rows (pre-Slice-5 themes) fall in this bucket. Iter-1 measured `tickers_inferred = 0 / 47` and 7/11 validation symbols still contaminated.

### What Slice 10 does

A one-shot script (`scripts/decontaminate-memory.ts`) walks all `active`/`fading` rows with non-empty `affected_tickers`, retrieves contributing stories via `source_batch_ids` from `analysis_filtered_news`, and re-runs `sanitizeAffectedTickers` from `ticker-sanitizer.ts` on each row. The same Slice 8 zero-evidence fallback and Slice 8C/9 primary coherence guard are applied.

### Columns rewritten (per row, only when diff is non-identity)

| Column | Rule |
|---|---|
| `affected_tickers` | `= san.kept` (replaces existing) |
| `tickers_inferred` | `= san.inferred` (replaces existing) |
| `primary_ticker` | Unchanged unless it was non-null and dropped from `san.kept` → set to `NULL` |
| `primary_ticker_source` | Nulled iff `primary_ticker` was nulled |

All other columns are untouched — `prompt_version`, `model_name`, `generated_at` etc. are preserved so the A/B boundary remains queryable.

### Safety guards

- `--dry-run` is the default. `--commit` must be passed explicitly.
- `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` master kill switch → script aborts immediately.
- Sanitizer-invent assertion: no ticker in `kept`/`inferred` may be absent from the original `affected_tickers`. Violation → abort.
- Erasure-rate threshold: commit aborts if > 10% of rows would have `kept=[]` (configurable via `--max-erasure-rate`).
- Single transaction with `SELECT … FOR UPDATE` row-level locks.
- `revert.sql` written BEFORE `COMMIT` — fully reversible.

### CLI

```
infisical run --env=prod -- npx tsx scripts/decontaminate-memory.ts \
  --dry-run --out tmp/validation/<date>/slice10-dry-run-all/

infisical run --env=prod -- npx tsx scripts/decontaminate-memory.ts \
  --commit --out tmp/validation/<date>/slice10-commit/
```

Optional narrowing: `--theme-id <uuid>`, `--limit N`.

### Artefacts

| File | When |
|---|---|
| `diff.jsonl` | Always (dry-run + commit) |
| `summary.md` | Always |
| `revert.sql` | Commit mode only, written BEFORE `COMMIT` |

### Reversibility

| Action | Effect |
|---|---|
| `psql -f revert.sql` | Restores all four columns per row to pre-Slice-10 values. Single command. |
| Discard artefacts | No state changed if only `--dry-run` was used. |

### What this slice intentionally does NOT do

- Does not change any production code path — `memory-curator.ts`, `ticker-sanitizer.ts`, and all consumer code are untouched.
- Does not add env flags or compose changes. One-shot script only.
- Does not recompute `primary_ticker` via `computeMemoryPrimary` (guard-only nulling, mirroring Slice 8C/9).
- Does not change `prompt_version` on existing rows.
- Does not modify `analysis_filtered_news`, `analysis_ticker_price_targets`, or any user-facing table.

---

## Step 14.1 — `analysis_smart_digest` (canonical per-ticker digest artifact)

Writer: `services/ai/gateway-2.0/src/core/analysis/digest-pipeline.ts` (flag-gated via `SMART_DIGEST_CANONICAL_ARTIFACT_ENABLED`)
Migration: `023_analysis_smart_digest.sql`

### Purpose

Decouples **content generation** from **per-user delivery**. Each generation attempt produces an immutable row in `analysis_smart_digest`; the existing per-user `user_recommendation_log` INSERT is unchanged in Step 14.1. Delivery-layer linkage (`digest_id` FK on `user_recommendation_log`) is deferred to Step 15.

### Reuse-eligibility columns

| Column | Class | Notes |
|---|---|---|
| `truth_hash` | deterministic | SHA-256 of `(priceTargetId, updatedAt, analysisDate, newsOneLiner, macroSignature)` |
| `context_hash` | deterministic | SHA-256 of memory themes + news headlines identity tuples |
| `schema_version` | deterministic | Bumped when `DigestBrief` payload shape changes |
| `generator_version` | deterministic | Manually bumped when generation algorithm changes meaningfully |
| `prompt_version` | nullable | Reserved for future LLM-augmented briefs |

### Audit-only columns (NOT used for reuse)

| Column | Class | Notes |
|---|---|---|
| `code_version` | provenance | Git SHA at generation time; routine deploys do NOT invalidate artifacts |
| `model_name` | provenance | Reserved for LLM model identification |

### Lifecycle states

`pending` → `generating` → `ready` | `failed` | `invalidated` | `superseded`

### Key design choices

- **Append-only:** every generation attempt is its own row; payload is never updated in-place once `ready`.
- **Partial unique index (`uq_smart_digest_inflight`):** prevents concurrent generators racing for the same slot.
- **Selection by query:** "current artifact" = `status='ready'` + matching fingerprints + freshness ceiling. No `is_current` flag.
- **Deploy-agnostic reuse:** `code_version` is stored for forensics but excluded from the reuse WHERE clause. Only `generator_version` (manually bumped) invalidates artifacts.

### What this step intentionally does NOT do

- Does not modify `deliverSmartDigest` or the `user_recommendation_log` INSERT shape.
- Does not add `digest_id` to `user_recommendation_log` (Step 15).
- Does not add maintenance jobs for superseding/reaping old rows (Step 16).
- Does not cover Daily Overview canonicalization (Step 14.2).
- Does not add LLM calls to per-ticker briefs (`prompt_version` remains NULL).

## Step 14.2 — `analysis_daily_overview` (canonical per-session daily overview artifact)

Writer: `services/ai/gateway-2.0/src/core/analysis/daily-overview-broadcaster.ts` (flag-gated)
Repository: `services/ai/gateway-2.0/src/core/analysis/daily-overview-repository.ts`
Fingerprint: `services/ai/gateway-2.0/src/core/analysis/daily-overview-fingerprint.ts`
Migration: `024_analysis_daily_overview.sql`

Decouples **LLM synthesis** from **per-user delivery**. Each generation attempt produces an immutable row in `analysis_daily_overview`; the existing per-user `user_recommendation_log` INSERT is unchanged in Step 14.2. Delivery-layer linkage (`overview_id` FK on `user_recommendation_log`) is deferred to Step 15.

### Canonical key

`(overview_date, session_type, locale)` — one artifact per session per day per locale. No intraday-window concept. `locale` defaults to `'en'` and is reserved for future multi-locale support.

### Reuse-eligibility columns (used in selection WHERE)

| Column | Class | Notes |
|---|---|---|
| `snapshot_hash` | deterministic | SHA-256 over projected `MarketSnapshot` (indices, crypto, commodities, dxy, yields, news themes) |
| `context_hash` | deterministic | SHA-256 over LLM-prompt context (prior overview refs, price trajectory, memory themes) |
| `schema_version` | deterministic | Bumped when payload shape changes |
| `generator_version` | deterministic | Manually bumped when orchestration logic changes meaningfully |
| `prompt_version` | deterministic | Bumped when LLM prompt text changes; defaults to `'overview.v1'` |
| `model_name` | deterministic | Participates in reuse selection (unlike 14.1 where it's audit-only); model swap genuinely changes output |

### Audit-only columns (NOT used for reuse)

| Column | Class | Notes |
|---|---|---|
| `code_version` | provenance | Git SHA at generation time; routine deploys do NOT invalidate artifacts |

### Payload columns

| Column | Class | Notes |
|---|---|---|
| `narrative` | LLM synthesis | Denormalized from `payload.synthesis.narrative` |
| `top_stories` | LLM synthesis | JSONB `string[]` |
| `message_body` | deterministic | Formatted Telegram markdown message |
| `synthesis_source` | deterministic | `'llm'` or `'template_fallback'` — first-class telemetry for fallback rate |
| `llm_duration_ms` | deterministic | LLM call latency; nullable |

### Lifecycle states

`pending` → `generating` → `ready` | `failed` | `invalidated` | `superseded`

### Key design choices

- **Append-only:** every generation attempt is its own row; payload is never updated in-place once `ready`.
- **Partial unique index (`uq_dov_inflight`):** prevents concurrent generators racing for the same slot on `(overview_date, session_type, locale)`.
- **Selection by query:** "current artifact" = `status='ready'` + matching hashes/versions + `overview_date` bound. No rolling freshness ceiling (the date IS the freshness bound). No `is_current` flag.
- **Deploy-agnostic reuse:** `code_version` is stored for forensics but excluded from the reuse WHERE clause. Only `generator_version`, `prompt_version`, and `model_name` (all manually controlled) invalidate artifacts.
- **Template fallback visibility:** when the LLM fails, a `ready` row with `synthesis_source='template_fallback'` is written so the broadcast still proceeds and the failure is auditable.
- **Feature flag:** `DAILY_OVERVIEW_CANONICAL_ARTIFACT_ENABLED` (default `false`). When off, the existing Redis-cached LLM path is used unchanged.

### What this step intentionally does NOT do

- Does not modify the `user_recommendation_log` INSERT shape or the Telegram fanout loop.
- Does not add `overview_id` to `user_recommendation_log` (Step 15).
- Does not add maintenance jobs for superseding/reaping old rows (Step 16).
- Does not migrate `fetchPriorOverviews` to read from `analysis_daily_overview.narrative` instead of scraping `user_recommendation_log.message_body` (deferred to Step 14.2.x or Step 15).
- Does not add per-locale synthesis (schema reserves `locale` column).

---

## Step 14.3 — Artifact generation orchestration cleanup

Step 14.3 extracts the shared artifact-generation orchestration into a single `runArtifactJob` primitive, normalizing the two duplicate orchestration paths (digest pipeline + daily overview broadcaster) into one coherent system.

### What changed

| Area | Before (14.1 + 14.2) | After (14.3) |
|---|---|---|
| Orchestration | Two ~115-LOC inline implementations in `digest-pipeline.ts` and `daily-overview-broadcaster.ts` | Single `runArtifactJob` (~90 LOC) in `artifact-orchestrator.ts`; two thin binder functions in `smart-digest-orchestrator.ts` and `daily-overview-orchestrator.ts` |
| Slot conflict | Digest: silent skip. Overview: fallback to legacy `synthesizeOverview` (Redis-cached LLM). | Uniform: acquire → 250ms backoff → re-read for reuse → `buildFallback` (digest: undefined/skip; overview: template fallback) |
| `markGenerating` CAS | Return value discarded in both paths | CAS loss triggers re-read → reuse-or-fallback (correctness fix) |
| Error classification | Digest: blanket `"generation_failed"`. Overview: inline classifier with 3 codes. | Shared `classifyArtifactError` with 9 codes in `artifact-errors.ts` |
| Trigger taxonomy | Ad-hoc strings: `"signal:entry_zone"`, `"http:trigger"`, `"cron:pre_market"` | Typed `ArtifactTriggerSource` union + `buildTriggerReason` helper in `artifact-trigger.ts` |
| Run identity | None — logs tied to individual artifact IDs | `runId` (UUID v4) generated at entry points; threaded through all orchestration logs via `makeArtifactRunLogger` |
| Admin inspection | No HTTP route; `listRecent` / `listRecentOverviews` existed but were unexposed | `GET /internal/artifacts/recent?kind=smart_digest|daily_overview` in `recommendations.ts` |

### New modules

| File | Purpose |
|---|---|
| `artifact-orchestrator.ts` | `runArtifactJob<H, B>(spec)` — shared orchestration primitive |
| `artifact-errors.ts` | `classifyArtifactError(err, hints?)`, `ARTIFACT_ERROR_CODES` |
| `artifact-trigger.ts` | `ArtifactTriggerSource` type, `buildTriggerReason(source, qualifier?, extra?)` |
| `artifact-logging.ts` | `newRunId()`, `newRunContext(type)`, `makeArtifactRunLogger(opts)` |
| `smart-digest-orchestrator.ts` | `orchestrateDigestArtifact(deps, runCtx, ...)` — digest binder for `runArtifactJob` |
| `daily-overview-orchestrator.ts` | `orchestrateDailyOverviewArtifact(deps, runCtx, ...)` — overview binder for `runArtifactJob` |

### Behavior changes (flag-on paths only)

1. **Slot-conflict policy for daily overview (flag-on):** Previously fell through to `synthesizeOverview` (Redis-cached LLM wrapper) on slot conflict. Now uses the orchestrator's uniform re-read + template fallback. Flag-off behavior unchanged.
2. **Digest error classification:** `"generation_failed"` blanket label → classified codes (`truth_fetch_failed`, `render_failed`, etc.). No upstream consumer reads `error_code` yet.
3. **`markGenerating` CAS check:** Previously discarded. Now a `false` return triggers re-read-or-fallback. Prevents leaving `pending` rows stuck on lost CAS.

### What this step intentionally does NOT do

- No schema changes to `analysis_smart_digest` or `analysis_daily_overview`.
- No delivery changes (`deliverSmartDigest`, `user_recommendation_log` shape).
- No new feature flags or env knobs.
- No fingerprint logic changes.
- No retry framework (next-trigger-arrival remains the retry mechanism).
- No `analysis_runs` table (structured logging covers observability).
- `resolveDemandSet` remains unused (reserved for future scheduled-window generation).

---

## Step 14.4 — Artifact system hardening

Step 14.4 adds operator-facing inspection, explain, and lifecycle endpoints to both artifact tables so that the system can be operated without raw SQL. This is the trust-building step before Step 15 moves delivery onto the artifact layer.

### New / enhanced endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/internal/artifacts/recent` | Enhanced: now accepts `status` filter, `summary=true` (omits `payload`/`truth_refs`/`snapshot_refs`). Backwards-compatible. |
| GET | `/internal/artifacts/inflight?kind=...&olderThanSec=...` | Lists `pending` / `generating` rows older than threshold. Read-only — no sweep. |
| GET | `/internal/artifacts/:kind/:id` | Uniform detail for any artifact by numeric id, regardless of kind. |
| GET | `/internal/artifacts/explain-current?kind=...&...` | Returns chosen row (or null), up to 5 fingerprint-matching candidates, up to 3 same-slot peers with different fingerprints. Answers "which row is current and why?". |
| POST | `/internal/artifacts/:kind/:id/invalidate` | CAS-guarded: only `ready` → `invalidated`. Requires `reason` (1..500 chars). Audited via `app.log.warn`. |

All endpoints require `x-service-key` matching `INTERNAL_SERVICE_KEY`.

### New modules

| File | Purpose |
|---|---|
| `artifact-admin-service.ts` | Kind-aware dispatch layer: `getArtifactById`, `listInflightArtifacts`, `listRecentArtifacts`, `explainCurrentDigest`, `explainCurrentOverview`, `invalidateArtifact`. |

### Repository additions (both `smart-digest-repository.ts` and `daily-overview-repository.ts`)

- `selectById` / `selectOverviewById` — lookup by numeric `id`.
- `markInvalidated` / `markOverviewInvalidated` — CAS `ready` → `invalidated`, sets `invalidated_at`, stores `reason` in `error_message`. Returns updated row or `null`.
- `listInflight` / `listInflightOverviews` — `status IN (pending, generating)` with freshness threshold.
- `findCurrentCandidates` / `findCurrentOverviewCandidates` — shares the same `WHERE` clause as `getCurrentArtifact` / `getCurrentOverviewArtifact` but returns top N instead of `LIMIT 1`.
- `findSlotPeers` / `findOverviewSlotPeers` — same slot keys, any fingerprints.
- `listRecent` / `listRecentOverviews` enhanced with optional `status` and `summary` parameters.

### Invalidation contract

- Only rows in `ready` status can be invalidated (CAS guard: `WHERE status = 'ready'`).
- `invalidated_at` set to `NOW()`, `error_message` set to the operator-provided reason.
- No bulk invalidation endpoint. No force flag.
- Invalidated rows are excluded from `getCurrentArtifact` reuse queries (the `status = 'ready'` filter already handles this).
- The invalidation is logged via `app.log.warn` with `actor: "service-key"`.

### What this step intentionally does NOT do

- No cron sweeper for stuck `pending`/`generating` rows (deferred to Step 16). The `inflight` endpoint is read-only.
- No auto-supersession of older `ready` rows (deferred to Step 16).
- No delivery-layer changes (`deliverSmartDigest`, `user_recommendation_log` shape, Redis dedup) — that is Step 15.
- No digest `buildFallback` parity (deferred).
- No schema migrations — all changes use existing columns already defined in 14.1/14.2.
- No changes to generation, fingerprinting, or orchestrator selection behavior.
- No back-office UI or frontend pages for artifacts.

---

## Step 15 — Delivery ledger rewiring

Migration: `025_user_recommendation_log_delivery_ledger.sql`
Writers: `digest-delivery.ts`, `daily-overview-broadcaster.ts`

Step 15 pivots `user_recommendation_log` from a content-bearing table into a true delivery ledger. Canonical content now lives only in `analysis_smart_digest` and `analysis_daily_overview`; the log records who got what, when, through which channel, and the delivery outcome.

### Schema changes (additive only)

| Column | Type | Default | Notes |
|---|---|---|---|
| `artifact_kind` | `VARCHAR(20)` | `NULL` | `'smart_digest'` or `'daily_overview'`; CHECK-constrained |
| `artifact_id` | `BIGINT` | `NULL` | FK target in the kind-routed artifact table; pair-constrained with `artifact_kind` |
| `channel_type` | `VARCHAR(20)` | `'telegram'` | Delivery channel |
| `delivery_status` | `VARCHAR(20)` | `'sent'` | `'sent'` or `'failed'`; CHECK-constrained |
| `delivery_failure_reason` | `VARCHAR(40)` | `NULL` | Machine-readable failure tag |

New indexes: `idx_url_artifact (artifact_kind, artifact_id)`, `idx_url_failed (delivery_status, sent_at DESC) WHERE delivery_status = 'failed'`.

`headline` and `priority` made nullable. No columns dropped.

### Delivery changes

- **Smart Digest**: `ArtifactRef { kind, id }` threaded from `persistCanonicalArtifacts` → `fanOutToWatchers` → `deliverSmartDigest`. The redundant `getCurrentArtifact` re-lookup in `fanOutToWatchers` was removed; the brief always comes from `generateDigestBrief`.
- **Daily Overview**: `broadcastDailyOverview` captures `artifactId` from the orchestrator result and always-inserts a ledger row (both sent and failed deliveries).
- **`message_body`**: set to `NULL` in both delivery INSERTs. Content is read from canonical artifact tables.

### Read-path migration

- `fetchPriorOverviews` reads `analysis_daily_overview.narrative` instead of parsing `user_recommendation_log.message_body`.
- `gatherContextRefs` prior-overview block reads `analysis_daily_overview (overview_date, session_type)` instead of `user_recommendation_log (headline)`.
- `inspect-digest.ts` resolves content via artifact lookup when `artifact_kind` + `artifact_id` are present.
- `verify-digest.ts` checks artifact-pair consistency and delivery-status distribution.

### What this step intentionally does NOT do

- No `DROP COLUMN` against `user_recommendation_log` (legacy `message_body`/`headline`/`priority`/`timeframe_alignment` remain).
- No backfill of old rows (pre-Step-15 rows keep `artifact_kind=NULL` forever).
- No real foreign key to artifact tables.
- No multi-channel delivery (schema is ready but code stays Telegram-only).

---

## Step 15.2 — Delivery-ledger cleanup & consistency

Migration: `026_user_recommendation_log_drop_ticker_not_null.sql`
Writers: `digest-delivery.ts`, `daily-overview-broadcaster.ts`
New modules: `delivery-failure.ts`, `delivery-ledger-queries.ts`, `digest-preferences.ts`

Step 15.2 closes the gaps that Step 15.1 deliberately left open after the canonical-artifact + ledger-row pivot. No schema drops, no backfill, no flag removal — those remain Step 16.

### What changed

| Slice | Theme |
|---|---|
| A | Unified `DeliveryFailureReason` taxonomy: `'telegram_unavailable' \| 'render_failed' \| 'send_failed' \| 'send_error'`. Smart Digest's overloaded `'render_or_send_error'` is split into `'render_failed'` (no card buffer) and `'send_error'` (channel call threw). Daily Overview's inline string literals are replaced with the typed values. |
| B | Failed-path test coverage on both writers (`digest-delivery.failed-paths.test.ts`, broadcaster failure block). Closes the Step 15.1 caveat that the failed shape was unverified at runtime. |
| C | Daily Overview now consults `user_recommendation_log` per-user before sending. The Redis short-circuit `digest:overview:sent:{date}:{session}` remains the cheap fast-path; `loadAlreadyDeliveredUserIds(db, artifact)` in `delivery-ledger-queries.ts` is the authoritative second gate. Survives Redis TTL expiry, crash recovery, manual replay. |
| D | Smart Digest cap counts only successful sends. `recordDigestSent` was moved from before `deliverSmartDigest` to after, gated on `delivery.ok`. A user whose `sendPhoto` fails no longer "spends" a daily slot to errors. |
| E | Unified preference resolution in `digest-preferences.ts`. Both Smart Digest (via `checkDigestThrottle`) and Daily Overview (defense-in-depth, behind the existing DB filter) now agree on the default-on policy when a `user_digest_preferences` row is missing. |
| F | `OVERVIEW_ALLOWED_USERS` allowlist removed. Was a 14.2-era staging guardrail; production cutover is complete. |
| G | Daily Overview ledger row stops carrying synthetic denorms: `ticker_symbol`, `priority`, `headline`, `timeframe_alignment` are now `NULL` on the new path. `recommendation_type` stays populated as the legitimate row-type discriminator that the RUNBOOK §4 audit query groups by. Migration 026 drops `NOT NULL` from `ticker_symbol` to make this safe. |
| H | `verify-digest.ts`: cap audit scoped to `recommendation_type != 'daily_overview' AND delivery_status='sent'`; tri-bucket row-shape distribution (`artifact_linked` / `legacy_message_body` / `legacy_empty`); new failure-reason vocabulary check; ≥95% artifact-linkage floor when ≥20 recent rows. `inspect-digest.ts`: distinct labels for `broken_artifact_link` vs `legacy_pre_15_1`. |
| I | Ledger-row invariant tests pin the 5 invariants every new write must satisfy: status enum, artifact pair, `message_body=NULL`, failed→reason set & valid, sent→reason null. Asserted across both writers via captured INSERT params. |

### Key design choices

- **Per-artifact, per-user dedup, not per-day.** Slice C's lookup keys on `(artifact_kind, artifact_id)` from migration 025's `idx_url_artifact`. Re-broadcasting the same artifact is idempotent at the user level; broadcasting a *different* artifact (later in the day, after the Redis key expires) is allowed and produces a new row.
- **`recommendation_type` is the row-type discriminator that survives.** All other denorm columns are NULL on the new path; this one stays because RUNBOOK §4 groups by it and `verify-digest.ts` uses it to scope the cap audit.
- **DB-level pref filter kept as fast-path.** Slice E adds the typed helper but does not remove the `COALESCE(dp.daily_overview_enabled, true) = true` filter in the recipient SQL — that collapse is a Step 16 concern.
- **`render_or_send_error` is gone.** Anyone grepping production logs for that string will find nothing post-deploy. The two replacement values (`render_failed`, `send_error`) are documented in RUNBOOK §4.

### What this step intentionally does NOT do

- No `DROP COLUMN` against `user_recommendation_log` (`message_body`, `headline`, `priority`, `timeframe_alignment` columns remain — Step 16).
- No backfill of pre-Step-15 rows.
- No real foreign keys to `analysis_smart_digest.id` / `analysis_daily_overview.id` (Step 16).
- No removal of `SMART_DIGEST_CANONICAL_ARTIFACT_ENABLED` / `DAILY_OVERVIEW_CANONICAL_ARTIFACT_ENABLED` flags. Flag-off remains the regression escape hatch.
- No multi-channel delivery (`channel_type` stays effectively constant).
- No sweepers / supersession of stuck artifacts (Step 16).
- No replacement of the per-user Redis Smart Digest cap with a ledger-derived cap (Step 16).
- No reopening of Step 12 (memory) or Step 13 (curator).

## Step 15.3 — Final denorm normalization

> Positioning: completes the ledger normalization that 15.2 began. No schema changes, no flag removal, no architectural lock-in.

Step 15.3 closes the last asymmetry between Smart Digest and Daily Overview ledger writes, and removes a dead write on the artifact table.

### Changes

| Slice | Description |
|-------|-------------|
| A | Smart Digest ledger INSERT now writes NULL for `priority`, `headline`, `message_body`, and `timeframe_alignment` — matching Daily Overview's shape from 15.2 slice G. `ticker_symbol` and `recommendation_type` remain populated (they carry real, non-legacy data on the Smart Digest path). |
| B | `analysis_daily_overview.message_body` is no longer written by the orchestrator. The `messageBody` param is removed from `MarkOverviewReadyParams` and the UPDATE SQL. The column stays in the schema; it was already NULL on every row written post-15.1. |

### What this step intentionally does NOT do

- No removal of `SMART_DIGEST_CANONICAL_ARTIFACT_ENABLED` / `DAILY_OVERVIEW_CANONICAL_ARTIFACT_ENABLED` flags — those are an operational escape hatch preserved for Step 16.
- No removal of `synthesizeOverview` from the broadcaster — still reachable via the flag-off path.
- No removal of flag-off test coverage — those code paths are still exercisable.
- No `DROP COLUMN` on either table.
- No schema migration.
