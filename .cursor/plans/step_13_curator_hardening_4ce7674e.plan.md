---
name: step 13 curator hardening
overview: "Finish the curator-side work in Step 13 by hardening the deterministic gates around analysis_market_memory writes so Smart Digest gets cleaner, less contaminated, more ticker-specific rows. Repackaged into one immediate low-risk core (Slice 8) plus three explicitly gated follow-on slices (9, 10, 11), each with its own approval and validation surface."
todos:
  - id: slice8-sanitizer
    content: "Slice 8 / 8A — Sanitizer hardening: expand BROAD_INDEX_BOILERPLATE_TICKERS into a tiered v1/v2 set (legacy + macro-proxy union GOLD/OIL/NATGAS/BTC/BTC-USD/ETH/ETH-USD); add MEMORY_CURATOR_BROAD_TICKER_TIER env reader (default v2); replace the zero-evidence fallback with the all-broad / mixed-theme tiered rule."
    status: pending
  - id: slice8-prompt
    content: "Slice 8 / 8B — Curator prompt revision: replace the affected_tickers paragraph in buildBatchCuratorPrompt() L450 with the SUBJECT-only scope-tightening text; bump MEMORY_CURATOR_PROMPT_VERSION; add a prompt-string regression guard test."
    status: pending
  - id: slice8-coherence
    content: "Slice 8 / 8C — Primary-ticker coherence guard (INSERT path only): if memoryPrimary.primary_ticker is not in sanitization.kept, null both primary_ticker and primary_ticker_source before INSERT. UPDATE path is intentionally untouched in Slice 8."
    status: pending
  - id: slice8-tests-docs
    content: "Slice 8 — cross-cutting: ticker-sanitizer.test.ts + memory-curator.test.ts cases, docs/upstream-trust-map.md Slice 8 section + reversibility table, full read-side regression parity check."
    status: pending
  - id: slice8-deploy
    content: "Slice 8 — append docker-compose env defaults, push, gh run watch, SSH-verify env presence + container version increment, capture BEFORE/AFTER snapshots, fill DECISION.md against the Slice 8 hard gates + directional targets."
    status: pending
  - id: slice9-update-path
    content: "Slice 9 (gated follow-on) — UPDATE-path sanitization. Separate plan, separate deploy, separate approval. Only scoped after Slice 8 has lived in prod for ~7 days and metrics have been observed. Adds env MEMORY_CURATOR_RESANITIZE_ON_UPDATE shipped as false initially, flipped to true via Infisical only after fixture replay + per-row dry-run on prod data."
    status: pending
  - id: slice10-decontaminate
    content: "Slice 10 (gated follow-on) — One-shot legacy decontamination script. Separate plan, separate approval. Builds services/ai/gateway-2.0/scripts/decontaminate-memory.ts (--dry-run default, explicit --commit), generates diff.jsonl + summary.md + revert.sql, requires explicit human review of dry-run output before any --commit. Cannot run until Slices 8 and 9 are both live so the new sanitizer behavior is what gets applied."
    status: pending
  - id: slice11-conditional
    content: "Slice 11 (conditional, telemetry-driven) — Theme-merge scope-aware dedup + deterministic text-token primary fallback. Only scoped if Slice 8/9/10 telemetry shows directional metrics still trending wrong after stabilization. Otherwise skipped and Step 13 closes."
    status: pending
isProject: false
---

# Phase 2 / Step 13 — Remaining curator hardening (revised)

## Revision summary

The earlier draft bundled five sub-slices (8A–8E) into a single immediate landing. That packaging was too fat: it mixed INSERT-path code changes, UPDATE-path mutation-semantics changes, and a one-shot data backfill into one bisect surface. Revised packaging:

- **Slice 8 — immediate core (low-risk, INSERT-only).** Sanitizer hardening + prompt revision + INSERT-path primary coherence guard. Single deploy. Bisectable. No live mutation of existing rows.
- **Slice 9 — UPDATE-path sanitization (gated follow-on).** Separate plan, separate deploy, separate approval. Riskier because it changes how existing rows mutate on every refresh.
- **Slice 10 — legacy decontamination script (gated follow-on).** Separate plan, separate approval. One-shot mutation of all active/fading rows. Operationally significant; cannot share a deploy surface with code changes.
- **Slice 11 — theme-merge + primary coverage (conditional).** Only if Slice 8/9/10 metrics still trend wrong.

Success metrics are also re-tiered into **hard correctness gates**, **directional improvement targets**, and **optional stretch thresholds** — no invented percentages.

---

## Current state grounding (verified by reading the code)

Sole writer: [services/ai/gateway-2.0/src/core/analysis/memory-curator.ts](services/ai/gateway-2.0/src/core/analysis/memory-curator.ts) `applyChanges` L730–890.

Known leaks driving the prod symptoms (`tickers_inferred ≈ 0`, low `primary_ticker` coverage, broad rows winning):

1. **Sanitizer fallback returns the original list unchanged when there is zero overlap evidence** ([ticker-sanitizer.ts L82–84](services/ai/gateway-2.0/src/core/analysis/ticker-sanitizer.ts)). This is the dominant reason `tickers_inferred` stays empty in prod — most curator runs simply don't yield a story whose `affected_tickers` overlaps the LLM's theme list.
2. **`BROAD_INDEX_BOILERPLATE_TICKERS` ([ticker-sanitizer.ts L10–21](services/ai/gateway-2.0/src/core/analysis/ticker-sanitizer.ts)) is too narrow.** Covers SPY/QQQ/SPX500/etc but excludes commodity proxies (`GOLD`, `OIL`, `NATGAS`) and crypto megacaps (`BTC`, `BTC/USD`, `ETH`, `ETH/USD`) that are equally used as boilerplate macro references.
3. **The curator prompt actively manufactures contamination** ([memory-curator.ts L450](services/ai/gateway-2.0/src/core/analysis/memory-curator.ts) — *"include at least one major index symbol (e.g. SPX500) alongside any ETFs"*).
4. **`applyChanges` UPDATE branch (L809–846) discards LLM-emitted `affected_tickers`.** The Zod update schema [llm-schemas.ts L120–186](services/ai/gateway-2.0/src/core/analysis/llm-schemas.ts) carries it; the SQL just doesn't consume it. (This is the lever Slice 9 will pull — not Slice 8.)
5. **`computeMemoryPrimary` runs over RAW `affected_tickers`** ([memory-curator.ts L755–762](services/ai/gateway-2.0/src/core/analysis/memory-curator.ts)) by intentional Slice-2 anchor invariance. Result: `primary_ticker` can be a ticker the sanitizer dropped, leaving `primary_ticker ∉ affected_tickers`.
6. **~49 legacy active/fading rows pre-date Slice 5** and will never self-clean. (This is the data Slice 10 addresses — not Slice 8.)

Slice 7 baseline ([tmp/validation/2026-05-12/slice7-debug-after/DECISION.md](tmp/validation/2026-05-12/slice7-debug-after/DECISION.md)): 49 active/fading rows, `inferred_nonempty = 0`, `attachmentKind="kept"` for every chosen row across 13 validation symbols. Consumer side ready; curator side is the bottleneck.

---

## Plan A — Slice 8: Immediate deterministic core

**Scope.** Three sub-slices that are all INSERT-time or pure-string changes. No UPDATE-path mutation semantics. No backfill. No script. Single deploy.

**Why this packaging is safer.** Every change in Slice 8 either (a) only affects newly-INSERTed rows, or (b) is a string change in a prompt that the LLM hasn't seen yet. There is no mutation of existing rows in this slice. If anything regresses, the blast radius is "next curator run produces a slightly different shape of new row" — observable, isolable, revertible by env or git revert.

### Slice 8A — Sanitizer hardening

**Problem.** Two distinct leaks in [ticker-sanitizer.ts](services/ai/gateway-2.0/src/core/analysis/ticker-sanitizer.ts): (a) zero-evidence fallback returns the original list unchanged, (b) the boilerplate set is too narrow.

**Code areas.**
- `BROAD_INDEX_BOILERPLATE_TICKERS` constant L10–21
- `sanitizeAffectedTickers()` L51–108
- `getSanitizeBroadTickersEnabled()` L34–38

**Proposed logic.**

1. Keep the existing constant. Add a sibling `BROAD_MACRO_PROXY_TICKERS: ReadonlySet<string>` containing `GOLD`, `OIL`, `NATGAS`, `BTC`, `BTC/USD`, `ETH`, `ETH/USD`. Compose them at call time based on a tier env reader (default `v2`).

2. Replace the zero-evidence branch (L82–84) with a tiered rule:
   - If theme `affected_tickers` is **entirely** within the broad set AND `evidencedUnion` is empty → move all to `tickers_inferred`, emit `kept = []`. Relax the L98–100 "would empty the array → restore" guard for this specific branch (otherwise it self-cancels).
   - If theme has at least one non-broad ticker AND `evidencedUnion` is empty → use the non-broad subset as a synthetic evidenced set; broad tickers move to `inferred`, non-broad stay in `kept`.
   - All other paths unchanged (Slice-5 parity).

3. Gates: existing `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS` (default `true`) still kills the whole sanitizer. New `MEMORY_CURATOR_BROAD_TICKER_TIER` (default `"v2"`, accepts `"v1"`) reverts the macro-proxy expansion only. Both via Infisical, no redeploy.

**Tests** ([ticker-sanitizer.test.ts](services/ai/gateway-2.0/src/core/analysis/__tests__/ticker-sanitizer.test.ts)).
- `tier=v1` is byte-identical to Slice 5 on all existing fixtures.
- `tier=v2` adds GOLD/BTC-USD/etc to inferred when unevidenced.
- All-broad theme + zero evidence → `kept=[], inferred=[…]` (and `applyChanges` SQL accepts empty `kept`).
- Mixed theme + zero evidence → broad → inferred, non-broad → kept.
- Tier env reader: default `v2`, accepts `v1`/`v2`, unknown → `v2`.

**DB/runtime evidence (read-only, no live changes).**

Use the prod JSON dump consumed by `validate-affinity.ts`. Replay every active/fading row through the v2 sanitizer in-process. Capture `(theme_id, kept_before, kept_after, inferred_before, inferred_after)` to `tmp/validation/<date>/slice8-debug-before/sanitizer-replay.jsonl`. This is read-only — no DB writes — and proves the new logic produces the expected shape on real data before we ship it.

**Rollback.** `MEMORY_CURATOR_BROAD_TICKER_TIER=v1` reverts the set expansion. `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` reverts the entire sanitizer. Both via Infisical.

---

### Slice 8B — Curator prompt revision

**Problem.** [memory-curator.ts L450](services/ai/gateway-2.0/src/core/analysis/memory-curator.ts) explicitly tells the LLM to include broad indices for macro themes. Removing that sentence is a deterministic gate adjustment, not "make the LLM smarter".

**Code areas.**
- `buildBatchCuratorPrompt()` L406–456
- `MEMORY_CURATOR_PROMPT_VERSION` in [provenance.ts L5–8](services/ai/gateway-2.0/src/core/analysis/provenance.ts)

**Proposed change.** Replace the `affected_tickers:` paragraph at L450 with scope-tightening text:

```
- affected_tickers: uppercase symbols only. Include only the tickers that
  are the SUBJECT of the article — i.e. the company, asset, or platform
  instrument the article is materially about. Do not include broad index
  proxies (SPX500, NSDQ100, DJ30, SPY, QQQ, DIA, IWM, VTI, VOO) or
  macro proxies (GOLD, OIL, NATGAS, BTC, BTC/USD, ETH, ETH/USD) just
  because the article references the broader market. Include them only
  if the article is itself ABOUT that index or commodity. Format: equities
  as AAPL/NVDA, platform crypto as BTC or BTC/USD, platform indices as
  SPX500/NSDQ100/DJ30/RTY, platform commodities as OIL/GOLD/NATGAS.
```

Bump `MEMORY_CURATOR_PROMPT_VERSION` by one (confirm current value at edit time). Every new INSERT/UPDATE writes the new version, giving us a clean A/B boundary in `analysis_market_memory.prompt_version` for analytics.

**Tests** ([memory-curator.test.ts](services/ai/gateway-2.0/src/core/analysis/__tests__/memory-curator.test.ts)).
- `buildBatchCuratorPrompt()` does NOT contain `"include at least one major index"`.
- `buildBatchCuratorPrompt()` DOES contain `"only the tickers that are the SUBJECT"`.
- Provenance test: a fresh INSERT records the new version string.

**Rollback.** Pure git revert. The prompt-version bump means the data-side A/B boundary is durable.

---

### Slice 8C — Primary-ticker coherence guard (INSERT path only)

**Problem.** `computeMemoryPrimary` runs on RAW LLM `affected_tickers` (L755–762). Sanitizer can drop the chosen primary, leaving `primary_ticker ∉ affected_tickers`.

**Important constraint.** This sub-slice deliberately does **not** touch the UPDATE branch. Adding the guard there changes mutation semantics on live rows and belongs in Slice 9.

**Code areas.** `applyChanges()` INSERT branch L752–806.

**Proposed logic.** Between the existing L770 (sanitization complete) and L780 (INSERT begins):

```ts
// Slice 8C: if the heuristic-derived primary was dropped by the sanitizer,
// the stored primary would point outside affected_tickers. Null it so
// consumers fall back to position-primary. Anchor invariance is preserved
// for the common case (sanitizer kept everything).
let coherentPrimary = memoryPrimary;
if (
  coherentPrimary.primary_ticker &&
  !sanitization.kept.includes(coherentPrimary.primary_ticker)
) {
  coherentPrimary = { primary_ticker: null, primary_ticker_source: null };
}
```

**Tests** ([memory-curator.test.ts](services/ai/gateway-2.0/src/core/analysis/__tests__/memory-curator.test.ts)).
- Theme `[SPX500, NVDA]`, heuristic picks SPX500, sanitizer drops it → `affected_tickers=[NVDA]`, `primary_ticker=null`, `tickers_inferred=[SPX500]`.
- Theme `[NVDA, AAPL]`, heuristic picks NVDA, sanitizer keeps both → `primary_ticker=NVDA` (regression parity).
- Theme where heuristic returns null → unchanged null primary (defensive).

**Rollback.** Pure git revert. No env flag needed; the change is small and tied to 8A semantics.

---

### Slice 8 — Cross-cutting tests & docs

- [docs/upstream-trust-map.md](docs/upstream-trust-map.md): append a Slice 8 section documenting the v1/v2 tier split, the new fallback rule, the coherence guard, the prompt-version bump, and a reversibility table mapping each env flag to the behavior it reverts.
- Existing read-side suites (`recommendation-engine.test.ts`, `digest-debug.test.ts`, `digest-symbol-affinity.test.ts`) MUST stay green with no env changes — Slice 8 must not change consumer behavior.

### Slice 8 — Recommended execution order

1. 8A (sanitizer) — pure, fixture-only.
2. 8B (prompt) — string + version bump.
3. 8C (coherence guard) — depends on 8A semantics for fixtures.
4. Replay sanitizer in-process against prod JSON dump → `slice8-debug-before/sanitizer-replay.jsonl`. Read-only proof.
5. Commit + push + `gh run watch`.
6. SSH deploy verify per workflow at the bottom.
7. Re-run `validate-affinity.ts` AFTER deploy. Capture per-symbol AFTER snapshots.
8. Fill `tmp/validation/<date>/slice8-debug-after/DECISION.md` against the Slice 8 hard gates + directional targets (below).

### Slice 8 — DB baseline queries (read-only, BEFORE any code change)

Single SSH session:

```sql
-- Q1: contamination breakdown
SELECT
  COUNT(*) FILTER (WHERE status IN ('active','fading'))                                     AS active_fading,
  COUNT(*) FILTER (WHERE status IN ('active','fading')
                   AND cardinality(tickers_inferred) > 0)                                   AS inferred_nonempty,
  COUNT(*) FILTER (WHERE status IN ('active','fading')
                   AND primary_ticker IS NOT NULL)                                           AS primary_present,
  COUNT(*) FILTER (WHERE status IN ('active','fading')
                   AND primary_ticker IS NOT NULL
                   AND NOT (primary_ticker = ANY(affected_tickers)))                         AS primary_incoherent,
  COUNT(*) FILTER (WHERE status IN ('active','fading')
                   AND cardinality(affected_tickers) >= 8)                                   AS broad_n_ge_8,
  COUNT(*) FILTER (WHERE status IN ('active','fading')
                   AND ARRAY['SPX500','NSDQ100','DJ30','SPY','QQQ','DIA','IWM','VTI','VOO']
                       && affected_tickers)                                                   AS broad_index_present
FROM analysis_market_memory;

-- Q2: per-row inventory (for Slice 9/10 baseline reference)
SELECT theme_id, theme, prompt_version, affected_tickers, tickers_inferred,
       primary_ticker, primary_ticker_source, last_updated
FROM analysis_market_memory
WHERE status IN ('active','fading')
ORDER BY last_updated DESC;
```

---

## Plan B — Slice 9: UPDATE-path sanitization (gated follow-on)

**Why this is split out.** Slice 9 changes how every existing row mutates on every refresh. Concrete risks:

- A bug in the UPDATE branch can silently corrupt rows that previously had clean `affected_tickers` — not just produce slightly-off new rows.
- Mutation semantics interact with the curator's update-frequency: a row touched 4× in 24h would be re-sanitized 4×, each pass potentially re-introducing or removing tickers based on that batch's contributing stories. This is qualitatively riskier than INSERT-only behavior.
- Bisecting a regression that surfaces in Smart Digest debug output gets harder when both INSERT-time logic AND UPDATE-time logic change in the same deploy.

**Sequencing.** Do not start scoping Slice 9 until Slice 8 has been live ≥ 7 days and the Slice 8 directional targets have been observed in prod. Use that data to calibrate the Slice 9 plan.

**Sketch (not the full plan — Slice 9 will get its own plan file).**

- Add `MEMORY_CURATOR_RESANITIZE_ON_UPDATE` env, **shipped as `false`**. Code path is dormant by default, mirroring the Slice 7 dormant-wiring posture.
- Behavior when flipped to `true`: the UPDATE branch consumes `upd.affected_tickers` (the LLM update payload already carries it), runs `sanitizeAffectedTickers()` over the union of (existing `affected_tickers` ∪ `upd.affected_tickers`), writes new SET clauses for `affected_tickers` / `tickers_inferred`, and applies the Slice 8C coherence guard to `primary_ticker`.
- Validation gate before flipping the env to `true`: a fixture-replay test that takes 10 representative prod rows from the Slice 8 baseline dump, simulates a curator update against each, and asserts the resulting (kept, inferred, primary) tuple is acceptable to a human reviewer. No `--commit` to prod until that review passes.
- Rollback: flip the env back to `false` via Infisical. No redeploy.

**Acceptance gate to start Slice 9.** Slice 8 metrics meet at least the hard correctness gates; directional targets show movement; no live regressions in `validate-affinity.ts` snapshots.

---

## Plan C — Slice 10: Legacy decontamination script (gated follow-on)

**Why this is split out.** A one-shot mutation of all active/fading rows is operationally significant enough to warrant its own plan, its own approval, and its own validation run. Bundling it with code changes mixes "code I can revert with git" and "data I can revert only by replaying a generated SQL script" — different operational risk classes.

**Sequencing constraint.** Slice 10 cannot run until Slice 8 (and ideally Slice 9) is live, because the script must use the new sanitizer logic to produce its diffs. Running it before Slice 8/9 lands would lock in pre-Slice-8 behavior on existing rows.

**Sketch (not the full plan — Slice 10 will get its own plan file).**

- New file [services/ai/gateway-2.0/scripts/decontaminate-memory.ts](services/ai/gateway-2.0/scripts/decontaminate-memory.ts).
- CLI: `--dry-run` (default) | `--commit`. Default refuses to mutate.
- Reads `analysis_market_memory` rows where `status IN ('active','fading')`, looks up contributing stories via `source_batch_ids`, runs the new sanitizer, applies the coherence guard.
- Writes:
  - `tmp/validation/<date>/slice10-decontamination/diff.jsonl` — before/after per row.
  - `tmp/validation/<date>/slice10-decontamination/summary.md` — counts.
  - `tmp/validation/<date>/slice10-decontamination/revert.sql` — generated only on `--commit`, contains the original column values per `theme_id` so the change is fully reversible by piping the file into psql.
- Acceptance gates that must pass during `--dry-run` review BEFORE `--commit`:
  - No row's `kept` becomes empty unless ALL its current `affected_tickers` are in the broad set (regression guard against accidental erasure of ticker-specific rows).
  - The script never invents a new `primary_ticker` value — it can only null it.
  - A human reviews `summary.md` and signs off in the DECISION file.
- Rollback: pipe `revert.sql` into psql.

**Acceptance gate to start Slice 10.** Slice 8 (and Slice 9 if it shipped) live in prod. Dry-run output reviewed by a human. Explicit go-ahead recorded in the DECISION file before `--commit`.

---

## Plan D — Slice 11: Theme-merge + primary coverage (conditional)

Only ship if Slices 8/9/10 are live and at least one of these is still trending wrong:
- A meaningful share of new INSERTs still produce `primary_ticker = NULL`.
- `validate-affinity.ts` AFTER snapshots show broad rows winning over narrower rows for the same symbol.

**Sketch.** Two sub-slices, each ~small.

- 11A — `mergeBatchResults()` ([memory-curator.ts L586–635](services/ai/gateway-2.0/src/core/analysis/memory-curator.ts)) replaces the title-equality dedup with a scope-aware dedup: when two new themes have overlapping `affected_tickers` and one is a strict subset of the other (post-sanitization), keep the narrower one and merge `key_facts`/`market_implications` from the broader into it.
- 11B — `computeMemoryPrimary()` text-token fallback: if the heuristic returns null AND exactly one of the row's sanitized `kept` tickers (or known aliases) appears in `theme || news_one_liner || summary`, use it as primary with new source `text_token_majority`. New constant; coercer extended in [primary-ticker.ts L197–201](services/ai/gateway-2.0/src/core/analysis/primary-ticker.ts).

Both deferred. Their plans will be written after Slices 8–10 are observed.

---

## Step 13 — Success metrics (re-tiered)

Three layers, in descending order of strictness. No invented percentages.

### Hard correctness gates (must pass for slice acceptance)

These are pass/fail. Failure blocks the slice from being declared done.

1. **No read-side parity regression.** All existing tests in `recommendation-engine.test.ts`, `digest-debug.test.ts`, `digest-symbol-affinity.test.ts` stay green with default env. Behavior on existing rows in `validate-affinity.ts` snapshots is byte-identical to BEFORE for any chosen row whose underlying DB row is unchanged.
2. **No new broad-contamination regressions on the validation set.** For the 11 spec validation symbols in `validate-affinity.ts`, no symbol's chosen-row AFTER has `cardinality(affected_tickers) >= BROAD_TAG_MIN (8)` while its BEFORE chosen-row had `cardinality < 8`. (Direction is one-way: broader → narrower is allowed; narrower → broader is a fail.)
3. **No primary-ticker incoherence introduced by Slice 8.** Any newly-INSERTed row in the 7 days post-deploy has `primary_ticker IS NULL OR primary_ticker = ANY(affected_tickers)`. (Legacy rows are not in scope here — Slice 10 handles them.)

### Directional improvement targets (must move in the right direction; no specific threshold)

Compare AFTER vs BEFORE on the same SQL queries (Q1 above). Direction matters; magnitude does not need to hit an invented number to pass.

1. **`tickers_inferred` becomes non-empty on new INSERTs.** Pre-Slice-8 baseline = 0. Post-Slice-8: at least one new INSERT in the 7 days post-deploy has `cardinality(tickers_inferred) > 0`. (This is the main thing the user called out as broken; "non-zero" is the right framing, not "≥ 30%".)
2. **`primary_ticker` coverage on newly-INSERTed rows trends up vs Slice 7 baseline rows of comparable age.** Compare new INSERTs' primary-non-null share against the Slice 7 baseline's primary-non-null share among rows with `last_updated` in the same age bucket. Direction: up. No specific delta required.
3. **Median `cardinality(affected_tickers)` on new INSERTs ≤ median on legacy rows.** Verifies the prompt revision is doing something. Direction: down or flat. No specific delta.

### Optional stretch thresholds (calibrate AFTER baseline observation; not pre-committed)

These are explicitly **not** decided pre-deploy. Once we have ~7 days of post-Slice-8 data, we record the observed distribution and decide whether to adopt an actual percentage threshold for Slice 9/10/11 acceptance. Any such threshold is justified by the observed baseline, not invented.

Examples of the kind of threshold we MIGHT adopt later — only if observed data supports them:
- A target `tickers_inferred` non-empty share once a steady-state distribution has been observed.
- A target `primary_ticker` coverage share on active/fading rows post-Slice-10 backfill.
- A target reduction in `broad_index_present` count post-Slice-10.

The plan deliberately does not commit to any of these numbers up front.

---

## Step 13 closure criteria

Step 13 is **complete** when:

1. Slice 8 ships and passes its hard gates + at least the first directional target (non-zero `tickers_inferred` on new INSERTs).
2. Slice 9 either ships and passes, or is explicitly deemed unnecessary based on Slice 8 telemetry.
3. Slice 10 either runs and passes its dry-run + commit gates, or is explicitly deemed unnecessary.
4. Slice 11 either ships, or (more likely) is explicitly skipped because the directional metrics already moved.

If Slice 8 alone moves all directional metrics in the right direction, Slices 9/10/11 may all be skipped and Step 13 closes after Slice 8 — the plan supports that outcome.

---

## What this plan intentionally does NOT do

- Does not change UPDATE-path mutation semantics in Slice 8. That waits for Slice 9.
- Does not run a backfill script in Slice 8. That waits for Slice 10.
- Does not commit to invented percentage thresholds for `tickers_inferred` / `primary_ticker` coverage. Hard gates and direction-only targets only.
- Does not move into Step 14 / canonical digest artifact design.
- Does not redesign delivery architecture.
- Does not rely on "let the LLM be smarter" — the prompt change removes a known pollution source; the rest is deterministic code/config.

---

## Workflow (always appended) — Slice 8 only

Slices 9, 10, 11 each get their own workflow appendix in their own plan files.

1. **Baseline check (SSH into VM)**
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → note current `stocktracker-gateway-2.0` image version
   - Run Q1 + Q2 above → `tmp/validation/<date>/slice8-debug-before/baseline.txt`
   - Replay sanitizer in-process against the prod JSON dump → `slice8-debug-before/sanitizer-replay.jsonl`. Read-only; no DB writes.

2. **Stage and push changes**
   - `git status` → `git add <listed files>` (never `git add .`) → `git commit -m "slice8(curator): sanitizer hardening + prompt revision + insert-path coherence guard"` → `git push origin main`
   - Files expected:
     - `services/ai/gateway-2.0/src/core/analysis/ticker-sanitizer.ts`
     - `services/ai/gateway-2.0/src/core/analysis/memory-curator.ts`
     - `services/ai/gateway-2.0/src/core/analysis/provenance.ts`
     - `services/ai/gateway-2.0/src/core/analysis/__tests__/ticker-sanitizer.test.ts`
     - `services/ai/gateway-2.0/src/core/analysis/__tests__/memory-curator.test.ts`
     - `deployment/vm/docker-compose.yml` (new env defaults: `MEMORY_CURATOR_BROAD_TICKER_TIER=v2`)
     - `docs/upstream-trust-map.md`

3. **Verify build**
   - `gh run watch`
   - Frontend not modified — no `vercel ls` needed
   - Build fails → `gh run view <run-id> --log` → fix → step 2

4. **Verify VM deployment**
   - SSH → `docker ps` → confirm `gateway-2.0` version increment
   - `docker exec gateway-2.0 env | grep -E 'MEMORY_CURATOR_(SANITIZE_BROAD_TICKERS|BROAD_TICKER_TIER)'`
     - Expected: `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=true`, `MEMORY_CURATOR_BROAD_TICKER_TIER=v2`
   - Note: `MEMORY_CURATOR_RESANITIZE_ON_UPDATE` is NOT yet wired in Slice 8 — it will appear in Slice 9.

5. **Capture AFTER snapshot + DECISION**
   - Re-run Q1 (Q2 only if a curator run has happened since deploy). Write `tmp/validation/<date>/slice8-debug-after/baseline.txt`.
   - Re-run `validate-affinity.ts` against fresh prod JSON dump. Write per-symbol AFTER snapshots.
   - Fill `tmp/validation/<date>/slice8-debug-after/DECISION.md` against the **hard gates** (pass/fail per item) and **directional targets** (BEFORE → AFTER values, direction).
   - Stretch thresholds section: leave blank for now; populate with observed distribution after ~7 days of post-deploy data.

6. **Done (for Slice 8).** Decide whether Slice 9/10/11 are needed based on the AFTER data. Open separate plan files for each that ships.
