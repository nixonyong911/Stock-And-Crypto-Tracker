# Step 15.2 — Delivery-ledger cleanup & consistency

> **Status:** Implemented in this branch. See `docs/upstream-trust-map.md` for the executed write-up; this file is preserved as the original plan-of-record.
>
> Positioning: this is **what remains after 15.1**, not a new feature step and not Step 16 pruning/perf work.
> Step 15.1 already proved the canonical-artifact + ledger-row pivot for both Smart Digest and Daily Overview in production. Step 15.2 is about closing the remaining gaps that 15.1 deliberately left open or papered over.

---

## 1. Diagnosis — what still feels awkward after 15.1

Concrete leftovers, grounded in the current code:

1. **Failed-delivery path is unverified at runtime.**
   `delivery_status='failed'` rows are written by both `digest-delivery.ts` (Smart Digest) and `daily-overview-broadcaster.ts`, but production naturally never produced one during the 15.1 cutover. We have no automated proof that the failed shape (artifact link present, `message_body=NULL`, correct `delivery_failure_reason`) is correct on either path.

2. **Failure-reason taxonomy is divergent across the two delivery paths.**
   - Smart Digest emits: `telegram_unavailable | send_failed | render_or_send_error` (typed `DeliveryFailureReason` in `digest-delivery.ts`).
   - Daily Overview emits: `send_failed | send_error` (string literals inline in `daily-overview-broadcaster.ts`), and writes **no row at all** when the Telegram extension is missing (early `return`).
   The column is the same; the vocabulary is not. The operator-facing failure-reason audit query in `RUNBOOK.md §4` already mixes the two.

3. **Smart Digest vs Daily Overview have asymmetric per-user "already delivered" guarantees.**
   - Smart Digest uses Redis per-user counter via `digest-eligibility.ts` (`checkDigestThrottle` + `recordDigestSent`).
   - Daily Overview uses a global Redis key `digest:overview:sent:{date}:{session}` and never inspects the ledger per user. If the global key TTL expires (43200s) and the broadcaster re-runs, every user gets a second row + a duplicate Telegram message. The new ledger could authoritatively prevent this, but doesn't.

4. **Smart Digest cap counts failed deliveries against the user's daily budget.**
   `recordDigestSent` is called **before** `deliverSmartDigest` in `digest-pipeline.ts:fanOutToWatchers`. A `telegram_unavailable` or `render_or_send_error` failure still consumes a slot. After 15.1 we now have explicit `delivery_status` so this can be tightened (cap = sent successes only) without losing ordering safety.

5. **Daily Overview honors `user_digest_preferences` differently from Smart Digest.**
   - Daily Overview reads `daily_overview_enabled` directly in the recipient SQL (`COALESCE(...,true)`).
   - Smart Digest reads `is_enabled` via a code-side throttle.
   Different columns, different code paths, different defaults in code vs schema. Hard to reason about end-to-end.

6. **`ALLOWED_USERS` allowlist is still gating Daily Overview** (`OVERVIEW_ALLOWED_USERS` env in `daily-overview-broadcaster.ts`). It was a 14.2 staging guardrail. Now that Daily Overview is artifact-linked in production it's a hidden filter that can mask bugs.

7. **Daily Overview ledger row has nonsensical denorm columns.**
   `ticker_symbol='MARKET'`, `priority='low'`, `headline='Daily Morning Brief'/'Daily Market Recap'`, `timeframe_alignment='full'` are all synthetic placeholders only useful pre-15.1. The artifact is now the source of truth. These don't need to be dropped (Step 16) but they should at minimum be NULL on new rows or sourced from the artifact row to avoid drifting from `analysis_daily_overview`.

8. **Read-path scripts treat `message_body=NULL` as `"empty"`, which is now the correct shape.**
   `verify-digest.ts` reports `shapeCounts.empty` and `verify-digest.ts`'s "no user > 6/day" check counts **all** rows including failed deliveries and Daily Overview rows, which were never supposed to be capped. The shape distribution report and the cap audit are both noisy after the cutover.

9. **`inspect-digest.ts` still falls back to `parseMessageBody` even when `artifact_kind` is set but the artifact lookup returns null.**
   That's a defensible fallback, but it logs a `WARN` and then prints "(empty)" which looks like data corruption. We should distinguish "broken link" (real warn) from "legacy row pre-15.1" (expected null).

10. **No structured invariant test against the new column shape.**
    The new ledger row has 5 invariants worth pinning down forever:
    - `delivery_status IN ('sent','failed')` — DB CHECK already enforces.
    - `(artifact_kind, artifact_id)` either both NULL or both set — DB CHECK already enforces.
    - On the new write path `message_body IS NULL`.
    - On `failed` rows `delivery_failure_reason IS NOT NULL`.
    - On `sent` rows `delivery_failure_reason IS NULL`.
    Only the first two are guarded; the last three live as code conventions.

Items **explicitly not** part of 15.2's diagnosis (they are Step 16):
- No diagnosis of dead/legacy columns (`headline`, `priority`, `timeframe_alignment`, `message_body`) → drop is a Step 16 concern.
- No diagnosis of materialized-view / sweeper / pruning needs.
- No reopening of Step 12 (memory) or Step 13 (curator) work.
- No extension to multi-channel (`channel_type` stays effectively constant).

---

## 2. Step 15.2 goal statement

After 15.2 the following are true:

- Failed-delivery rows on **both** Smart Digest and Daily Overview paths are exercised by automated tests and have been observed to write the expected ledger shape (artifact link + `message_body=NULL` + `delivery_failure_reason` set + `delivery_status='failed'`).
- The two paths share **one** failure-reason vocabulary, defined once.
- Daily Overview consults the ledger (or an equivalent per-user signal derived from it) to prevent duplicate per-user delivery within the same `(overview_date, session_type)`. Smart Digest's per-user cap remains Redis-driven but no longer counts failed deliveries against the cap.
- The two paths read user preferences through one preference-resolution helper, on a consistent column set.
- The `OVERVIEW_ALLOWED_USERS` allowlist is removed (or downgraded to documented-emergency-only).
- Daily Overview ledger rows do not write synthetic denorm placeholders; the columns the new path doesn't naturally fill are written as `NULL`.
- `verify-digest.ts` and `inspect-digest.ts` interpret `message_body=NULL` and the artifact link as the **expected** post-15.1 shape, with shape buckets and cap-audit queries scoped correctly.
- A small invariant test suite pins the 5 ledger-row invariants listed in §1 item 10.

After 15.2, **delivery semantics are coherent across Smart Digest and Daily Overview, the failed path is provably correct, and read-path tooling reads the new world natively** — without touching schema (no `DROP COLUMN`), without changing fan-out scope, and without introducing new feature flags.

---

## 3. Recommended scope (opinionated)

In scope (these are the genuine 15.1 leftovers):

| # | Theme | Why now |
|---|---|---|
| A | Unified `DeliveryFailureReason` taxonomy across both writers | One code change; preconditions everything else |
| B | Failed-path test coverage on both writers | Closes the user's stated caveat |
| C | Daily Overview per-user duplicate prevention via ledger | Real semantic gap that exists today |
| D | Smart Digest cap = sent-successes (skip cap consumption on failure) | Now possible because we have `delivery_status` |
| E | Unified preference resolution (one helper, one column policy) | Removes a source of "why did this user get/not get X?" confusion |
| F | Drop `OVERVIEW_ALLOWED_USERS` allowlist | Cutover is complete; allowlist is now stale risk |
| G | NULL-out synthetic denorm placeholders on Daily Overview ledger writes | Stops the ledger from disagreeing with the artifact |
| H | Verify/inspect scripts updated to treat post-15.1 shape as canonical | Operator UX |
| I | Ledger-row invariant tests (the 5 invariants above) | Pins the new contract |

Deferred (NOT in 15.2):

- Schema column drops (`message_body`, `headline`, `priority`, `timeframe_alignment`) → Step 16.
- Backfill of pre-Step-15 rows → Step 16.
- Real foreign keys to `analysis_smart_digest.id` / `analysis_daily_overview.id` → Step 16.
- Multi-channel delivery (email, push, in-app) → post-Step-16 product work.
- Dedup pruning / materialized-view delivery summaries → Step 16.
- Sweeping / superseding stuck artifacts → Step 16.
- Removing the `SMART_DIGEST_CANONICAL_ARTIFACT_ENABLED` / `DAILY_OVERVIEW_CANONICAL_ARTIFACT_ENABLED` flags → Step 16. (15.2 keeps both flags; flag-off path is still the regression escape hatch.)

---

## 4. Parallel execution strategy

Hard rule: **anything that touches `digest-delivery.ts` or `daily-overview-broadcaster.ts` write-path is the critical-section** because those are the two writers of the ledger. Two cloud agents must not both edit them concurrently.

| Group | Slices | Can run in parallel? | Why |
|---|---|---|---|
| Sequential **first** | A (taxonomy) | No — must precede B/C/D/G | All other writer-side edits import from this |
| Parallel pod | B-test, H-scripts, I-invariants | Yes | All read-only, test-only, or script-only; no production code overlap |
| Sequential **after A** | D (cap behavior on failure) | No — must follow A and uses the new typed reason | Inside `digest-pipeline.ts` + `digest-eligibility.ts` |
| Sequential **after A** | C (Daily Overview ledger-based dedup) | No, conflicts with G & F in same file | Inside `daily-overview-broadcaster.ts` |
| Combined with C | G (NULL synthetic denorms) + F (drop allowlist) | Yes — bundle into the same agent that does C | Same file; one PR keeps the file's history clean |
| Parallel pod | E (preference helper) | Yes after A | New file; touches one query in `daily-overview-broadcaster.ts` near the end |

**Suggested concurrent fan-out** (after slice A is merged):
- Agent-1: slices C+F+G (single PR on `daily-overview-broadcaster.ts`)
- Agent-2: slice D (single PR on `digest-pipeline.ts` + `digest-eligibility.ts`)
- Agent-3: slice E (new module + small wiring)
- Agent-4: slices B + I (test files only)
- Agent-5: slice H (verify / inspect scripts only)

Slice A blocks the others **only** because it defines the typed taxonomy that B/C/D consume; once A lands as a small, surgical commit, the rest fan out cleanly with no file-level overlap except (C, F, G) which are bundled.

---

## 5. Implementation slices

Each slice is sized so a single cloud agent can land it in one PR with tests.

### Slice A — Unified failure-reason taxonomy *(prerequisite, ~small)*

- Move `DeliveryFailureReason` from `digest-delivery.ts` into a new `delivery-failure.ts` (same folder).
- Final union: `'telegram_unavailable' | 'render_failed' | 'send_failed' | 'send_error'`. Drop `'render_or_send_error'` (split into `render_failed` and `send_error`).
- Replace inline strings in `daily-overview-broadcaster.ts` with the typed values.
- Add a runtime guard `assertDeliveryFailureReason(s: string)` used only in tests, so the test pod (slice B) can statically prevent drift.
- No DB change; the column is already `VARCHAR(40)`.

### Slice B — Failed-delivery test coverage *(parallel pod)*

In `services/ai/gateway-2.0/src/core/analysis/__tests__/`:

- Add `digest-delivery.failed-paths.test.ts`:
  - telegram extension absent → `delivery_status='failed'`, reason `telegram_unavailable`, `artifact_kind/id` still threaded, `message_body=NULL`.
  - `renderSmartDigestCard` returns null → reason `render_failed`.
  - `sendPhoto` resolves `{ ok: false }` → reason `send_failed`.
  - `sendPhoto` throws → reason `send_error`.
- Extend `daily-overview-broadcaster.test.ts` failed-path block (currently only covers happy path):
  - `sendText` resolves `{ ok: false }` → `delivery_status='failed'`, reason `send_failed`, artifact link still present.
  - `sendText` throws → reason `send_error`.

### Slice C — Daily Overview per-user duplicate prevention via ledger *(critical section)*

In `daily-overview-broadcaster.ts`:

- After the recipient query and before each `sendText`, look up whether `(clerk_user_id, artifact_kind='daily_overview', artifact_id=<this artifact_id>)` already exists in `user_recommendation_log`. If so, mark the recipient as `skipped` (don't send, don't write a duplicate row).
- This is **per-artifact** dedup, not per-(date,session). It correctly handles re-invocation (e.g. crash recovery, manual replays) without re-spamming users, and naturally degrades to "no-op" when the same artifact is reused.
- Keep the existing `digest:overview:sent:{date}:{session}` Redis short-circuit as a cheap fast-path; the ledger lookup is the authoritative second gate.
- Add a small SQL helper `loadAlreadyDeliveredUserIds(db, artifactId)` and unit-test it.

### Slice D — Smart Digest cap stops counting failed deliveries

In `digest-pipeline.ts:fanOutToWatchers`:

- Move `recordDigestSent` from **before** `deliverSmartDigest` to **after**, gated on `delivery.ok === true`.
- Add a regression test in `digest-pipeline-artifact.test.ts` that asserts: a watcher whose send fails does NOT have `recordDigestSent` invoked.
- Document the behavior change in a one-line comment near the gate. No env flag — this is a small correctness fix that only affects users whose deliveries were already broken anyway.

### Slice E — Unified preference resolution helper

- New file: `services/ai/gateway-2.0/src/core/analysis/digest-preferences.ts`
- One function `loadDeliveryPrefs(db, clerkUserIds: string[]): Promise<Map<string, { smartDigestEnabled: boolean; dailyOverviewEnabled: boolean }>>`
- Source of truth: `user_digest_preferences (is_enabled, daily_overview_enabled)`, both default `true` when row missing.
- Update `digest-eligibility.checkDigestThrottle` to call this helper for `is_enabled`.
- Update Daily Overview recipient query to filter by the helper result post-fetch instead of inline `COALESCE(dp.daily_overview_enabled, true) = true` (keep DB filter as a fast-path; the helper still runs for symmetry and gives one place to reason about defaults).
- No schema change.

### Slice F — Drop `OVERVIEW_ALLOWED_USERS` allowlist

- Remove the env read and the `allowlistClause` SQL template from `daily-overview-broadcaster.ts`.
- Remove the env from `.env.example` / `docker-compose.yml` if present (search and grep). Add a one-line note to `RUNBOOK.md §4`.
- Trivial; bundled into the slice-C PR to keep file churn coherent.

### Slice G — NULL synthetic denorm placeholders on Daily Overview ledger writes

- In the broadcaster INSERT replace `'MARKET'`, `'low'`, headline string, and `'full'` with `NULL` for `ticker_symbol`, `priority`, `headline`, `timeframe_alignment`.
  - **Pre-flight check (must do before writing the change):** confirm `ticker_symbol` is nullable. If it's `NOT NULL`, this slice becomes a small additive migration to drop the constraint (still additive only — no `DROP COLUMN`). If it must stay `NOT NULL` for now, write `''` and note it as a Step 16 follow-up. (Migration `025_*.sql` already drops `NOT NULL` from `headline` and `priority`; `ticker_symbol` and `timeframe_alignment` need verification.)
- Add a test asserting these positions are `NULL` on the new path and unchanged on the flag-off path.
- Bundled into the slice-C PR (same file).

### Slice H — Verify / inspect scripts learn the post-15.1 shape

- `scripts/verify/verify-digest.ts`:
  - Scope the `> 6 entries/day` cap audit to `recommendation_type != 'daily_overview' AND delivery_status = 'sent'`.
  - Replace `shapeCounts.empty` reporting with a tri-bucket: `artifact_linked` (artifact_kind set), `legacy_message_body` (artifact_kind null AND message_body not null), `legacy_empty` (both null — pre-15.1 nulls or genuine corruption).
  - Add a check `linked_recent / total_recent_new_rows > 0.95` — soft floor that would catch a regression where the new path stops linking.
- `scripts/verify/inspect-digest.ts`:
  - When `artifact_kind` is set but `resolveArtifact` returns null, log as `[artifact] WARN: link broken — artifact row missing or invalidated` rather than silently falling through to `parseMessageBody`.
  - When neither `artifact_kind` nor `message_body` is present and `sent_at < 2026-04-01` (pre-cutover-ish), label as `legacy pre-15.1` instead of `empty`.

### Slice I — Ledger-row invariant tests

In `services/ai/gateway-2.0/src/core/analysis/__tests__/ledger-invariants.test.ts` (new file):

Pin all 5 invariants from §1.10 as pure unit assertions over the captured INSERT param arrays from both writers (the existing test harness already captures `_queries`):

1. `params[10]` (delivery_status) ∈ {'sent','failed'}.
2. (`params[7]` (artifact_kind) === null) === (`params[8]` (artifact_id) === null).
3. `params[5]` (message_body) === null on the new path.
4. `params[10] === 'failed' ⟹ params[11] !== null`.
5. `params[10] === 'sent' ⟹ params[11] === null`.

These are cheap and catch the most common regressions when someone touches either writer.

---

## 6. Files / functions likely to change

| File | Change |
|---|---|
| `services/ai/gateway-2.0/src/core/analysis/delivery-failure.ts` | **NEW** — typed `DeliveryFailureReason` union + assert helper |
| `services/ai/gateway-2.0/src/core/analysis/digest-delivery.ts` | Import unified type; rename `render_or_send_error` → `render_failed` / `send_error` |
| `services/ai/gateway-2.0/src/core/analysis/daily-overview-broadcaster.ts` | Use unified type; remove `OVERVIEW_ALLOWED_USERS`; per-user ledger dedup; NULL denorm placeholders |
| `services/ai/gateway-2.0/src/core/analysis/digest-pipeline.ts` (`fanOutToWatchers`) | Move `recordDigestSent` to after success |
| `services/ai/gateway-2.0/src/core/analysis/digest-eligibility.ts` (`checkDigestThrottle`) | Read prefs through `digest-preferences.ts` |
| `services/ai/gateway-2.0/src/core/analysis/digest-preferences.ts` | **NEW** — `loadDeliveryPrefs` |
| `services/ai/gateway-2.0/src/core/analysis/__tests__/digest-delivery.failed-paths.test.ts` | **NEW** |
| `services/ai/gateway-2.0/src/core/analysis/__tests__/daily-overview-broadcaster.test.ts` | Add failed-path coverage + per-user-dedup coverage + denorm-NULL coverage |
| `services/ai/gateway-2.0/src/core/analysis/__tests__/digest-pipeline-artifact.test.ts` | Cap-not-incremented-on-failure regression |
| `services/ai/gateway-2.0/src/core/analysis/__tests__/ledger-invariants.test.ts` | **NEW** |
| `scripts/verify/verify-digest.ts` | Cap audit scoping; tri-bucket shape; linked-rate floor |
| `scripts/verify/inspect-digest.ts` | Better warn for broken link; legacy label |
| `RUNBOOK.md` §4 | Note allowlist removal; note new failure-reason vocabulary |
| `docs/upstream-trust-map.md` Step 15 section | Append a "Step 15.2 — delivery cleanup" subsection |

Files explicitly **not** changing in 15.2:

- Migrations directory (no schema work; possible exception: slice G needs a tiny additive `ALTER ... DROP NOT NULL` if and only if `ticker_symbol`/`timeframe_alignment` are `NOT NULL` today).
- `analysis_smart_digest`, `analysis_daily_overview` repository or fingerprint files.
- `artifact-orchestrator.ts`, `smart-digest-orchestrator.ts`, `daily-overview-orchestrator.ts`.
- Anything under `core/pipeline-consumer.ts` beyond the slice-D ripple if needed.

---

## 7. Verification expectations

### Implementation-side (per slice; required before merging that slice)

- `npm run typecheck` and `npm test` clean in `services/ai/gateway-2.0/`.
- Failed-path tests added in slice B all pass; the new ledger-invariant tests added in slice I all pass.
- Static check: search for any string literal in the broadcaster files that should now go through `DeliveryFailureReason`.
- Search for any remaining read of `user_recommendation_log.message_body` outside the verify/inspect scripts → must be zero.
- Search for any remaining write of `'MARKET'` / `'Daily Morning Brief'` / `'low'` placeholders in delivery code → must be zero (or guarded by the flag-off path only).

### End-to-end (after all slices land, before declaring 15.2 done)

- Run `tsx scripts/verify/verify-digest.ts` against staging DB and confirm:
  - `linked / total > 0.95` for last 48h.
  - `legacy_empty` count is roughly stable (i.e. only growing from pre-cutover backfill, not from new writes).
  - The cap audit returns zero rows.
  - The failure-reason distribution uses only the four unified values.
- Run `tsx scripts/verify/inspect-digest.ts --user <known_user> --limit 10` and confirm artifact-linked rows resolve cleanly with no spurious WARNs.
- Trigger a forced Daily Overview broadcast against a test user, then immediately re-invoke before the Redis key TTL elapses (simulate replay) and confirm the second invocation **does not** produce a duplicate ledger row (slice C).
- For Smart Digest, manually deliver to a user with a deliberately invalid `platform_user_id` (or stub the extension to throw) and confirm:
  - one `delivery_status='failed'` row written with the correct `delivery_failure_reason`,
  - the user's Redis cap counter is **not** incremented (slice D).

### Runtime / production observability after deploy

- 24h after rollout, run RUNBOOK §4 "Delivery failure audit" and confirm the only `delivery_failure_reason` values present are members of the unified union.
- Confirm `linked_recent_count > 0` in the artifact-linked query — i.e. the cutover didn't regress.

---

## 8. Out of scope

Explicitly **deferred** to Step 16 (or later):

- Dropping legacy columns from `user_recommendation_log` (`message_body`, `headline`, `priority`, `timeframe_alignment`).
- Backfilling pre-Step-15 rows with synthetic `artifact_kind` / `artifact_id`.
- Adding real foreign keys (`artifact_id` → `analysis_smart_digest.id` / `analysis_daily_overview.id`).
- Sweeping stuck `pending` / `generating` artifact rows.
- Auto-supersession of older `ready` artifacts.
- Pruning / materialized-view delivery summaries.
- Removing the `*_CANONICAL_ARTIFACT_ENABLED` env flags (the flag-off branch stays as the regression escape hatch).
- Multi-channel delivery (`channel_type` other than `'telegram'`).
- Per-locale `Daily Overview` synthesis.
- Touching Step 12 (memory) or Step 13 (curator).
- Reworking `digest:signal:` Redis dedup at the signal level.
- Replacing the per-user Smart Digest cap with a ledger-derived cap. (Possible Step 16; for 15.2 we only stop counting failures.)
- Any UI / back-office surfacing of the ledger.

---

## 9. Risks / edge cases

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | Slice A renames a string literal that an external tool greps for in logs | Medium | Keep the **new** values short and grep-friendly; mention in `RUNBOOK.md`. |
| 2 | Slice C's per-user ledger lookup adds N queries per broadcast | Low (broadcasts are infrequent and small) | Single `SELECT clerk_user_id WHERE artifact_kind=$1 AND artifact_id=$2` returns a Set used for the in-loop check. One query, not N. Index `idx_url_artifact` already exists. |
| 3 | Slice D changes Smart Digest cap semantics; some user could now receive >6 sends if many had failed before | Low — failures are rare | The user cap is preserved; only **failed** sends stop consuming budget. Worst case: a user previously stuck at "6 failed → 0 received" now gets 6 successful sends. That's the desired behavior. |
| 4 | Slice E breaks the existing inline SQL filter for `daily_overview_enabled = true` defaults | Medium | Keep both DB-level filter and code-level helper for a release; remove the DB filter in Step 16 once the helper has been proven. |
| 5 | Slice F removes a guardrail real users were relying on for staging | Low (the user confirmed runtime cutover is done) | Leave the env wiring for one release as a no-op with a `WARN: OVERVIEW_ALLOWED_USERS is deprecated` if set. |
| 6 | Slice G writes NULL into a NOT NULL column → INSERT crashes | Medium if not pre-checked | Run the column-nullability pre-flight (`pg_attribute`) before changing the writer. If `NOT NULL`, add the additive `ALTER ... DROP NOT NULL` to slice G. |
| 7 | Slice H's tri-bucket numbers will look "different" the day after deploy and trigger an alarm | Low | Communicate the bucket rename in the deploy commit; verify-digest output is human-read, not alerted on. |
| 8 | Cloud-agent parallel fan-out collides on `daily-overview-broadcaster.ts` | High if agents are not coordinated | Bundle slices C+F+G into a **single agent's PR**. Other slices intentionally don't touch this file. |
| 9 | Slice C lookup races with the very INSERT that follows for another recipient | Very low | The lookup is per-recipient and sequential; the loop already serializes. No SELECT FOR UPDATE needed. |
| 10 | Over-cleaning temptation — drop the legacy columns "while we're in there" | Real | Anchor: §8 forbids it. Reviewer rejects any PR that touches column drops in 15.2. |
| 11 | Mixing Step 16 perf concerns into 15.2 (e.g. "let's also add an index") | Real | Only `idx_url_artifact` is needed and already exists; no new indexes in 15.2. |

---

## 10. Preferred execution order

1. **Slice A** lands first as a single small PR (taxonomy refactor). Blocks B/C/D.
2. **Once A is merged**, fan out in parallel:
   - Agent-1 → Slice C + F + G (one PR, `daily-overview-broadcaster.ts` + minor docs)
   - Agent-2 → Slice D (one PR, `digest-pipeline.ts` + `digest-eligibility.ts`)
   - Agent-3 → Slice E (one PR, new helper + small wiring)
   - Agent-4 → Slice B + Slice I (one PR, tests-only)
   - Agent-5 → Slice H (one PR, scripts-only)
3. **After all parallel PRs merge**, run the §7 end-to-end checks.
4. Update `docs/upstream-trust-map.md` with a short "Step 15.2 — delivery cleanup" appendix in the Step-15 section. (Could be folded into Agent-1's PR; treat as the final commit of the step.)

---

## Appendix — appended deployment workflow (per house rules)

1. **Baseline check (SSH into VM)**
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → note current `gateway-2.0` image tag.
2. **Stage and push changes**
   - `git status` → `git add <file1> <file2> ...` → `git commit -m "msg" && git push origin <branch>`
   - Never use `git add .` — other agents may have uncommitted changes.
3. **Verify build**
   - GitHub Actions: `gh run watch`.
   - **Only proceed when builds pass.**
   - On failure: `gh run view <run-id> --log` → fix → step 2.
4. **Verify VM deployment**
   - SSH → `docker ps` → confirm `gateway-2.0` tag incremented.
   - Container down or unchanged → fix → step 2.
5. **Done.**
