---
name: Smart Digest Step 5
overview: "Improve Smart Digest context-quality at the source-interface layer by separating two decisions: (1) which memory row is the best on-symbol association, and (2) whether that row is good enough to surface as a user-facing context line. Introduces a coherent ranking model, treats one-liner symbol mention as a soft signal, and adds debug visibility — without expanding product scope."
todos:
  - id: ranking-model
    content: "Define and implement a coherent association-ranking model (impact, affinity, freshness decay, relevance, one-liner mention bonus) in recommendation-engine.ts"
  - id: surfacing-decision
    content: "Introduce a separate context-surfacing score in digest-brief-truth.ts (one-liner mention as soft signal, not hard gate); keep current impact/relevance/freshness gates as the floor"
  - id: macro-restraint
    content: "Tighten macro fallback so it cannot mask weak per-symbol context (review MACRO_DOMINANT_THEME_MIN_AGREEMENT and MACRO_SENTIMENT_GATE against debug evidence; bump only if evidence supports it)"
  - id: debug-surface
    content: "Surface ranking inputs and surfacing score per candidate in digest-debug.ts (associationScore, freshnessDecay, oneLinerMentionsSymbol, surfacingScore, surfacingDecision)"
  - id: tests
    content: "Unit + property tests for ranking ordering, surfacing decision tiers, and the AAPL/MSFT/GOLD scenarios captured in live debug"
  - id: live-validation
    content: "Re-run debug-digest on the same 11-symbol set; record before/after for chosenRow, contextSource, and notes"
  - id: optional-neutral-fallback
    content: "OPTIONAL / GATED on validation: surface context on neutral-fallback path (deferred until ranking + surfacing changes are validated)"
isProject: false
---

# Smart Digest Step 5 — Context Quality at the Source-Interface Level

## Framing: two decisions, not one

Step 3 established that a row's *association* with a symbol must clear an
affinity floor. Step 5 makes the next conceptual cut explicit:

| Decision | Question it answers | Output | Lives in |
|---|---|---|---|
| **Association** | Which memory row best represents what is currently happening *to or near* this symbol? | One winning row per symbol (or none) | `recommendation-engine.ts` (`compareMemoryCandidates`) |
| **Surfacing** | Is this row's `news_one_liner` strong enough to put in front of the user as the digest's context line? | yes / no (and why) | `digest-brief-truth.ts` (`memoryPassesContextGate`, `deriveContextFromTruth`) |

Today these are tangled: a row that wins association is treated as
automatically eligible for surfacing if it clears flat impact/relevance
gates. Step 5 keeps both decisions but gives them *separate inputs and
rationale*, so that "valid association, weak surfacing" produces an
intentional omission rather than a misleading line.

This separation is the spine of the plan. Everything below either
strengthens **association ranking** or **surfacing eligibility**, never
silently mixes them.

---

## Evidence from live debug (2026-05-11T02:47 UTC)

Inspected via `POST /internal/debug-digest` on prod VM
(`stocktracker-gateway-2.0:v1.2`):
AAPL, BTC/USD, NVDA, TSLA, GOLD, META, ETH/USD, GOOGL, SPX500, SOL/USD,
MSFT.

Concrete, on-the-record problems:

- **AAPL** — chosen row is 170h old (Berkshire/Buffett) and fails the
  72h freshness gate; a 32h-old "Google Health vs Apple Watch" row
  passes the gate but fails affinity (score=1). A genuinely on-symbol
  Apple Siri-litigation row (80h) passes affinity but also misses the
  72h gate. **Result: zero context** even though two of four candidates
  are about Apple.
- **MSFT** — chosen row's *theme* mentions MSFT (giving affinity=2) but
  the `news_one_liner` itself is "Google Cloud and Genpact's agentic AI
  deal for CFO offices…". If we surface this as MSFT's context line we
  show a sentence that is **not about MSFT**.
- **GOLD** — chosen row "Pakistan Rupee Near-Term Stability" passes
  affinity=3 because GOLD is in `affected_tickers`, but the line is
  about PKR/USD with gold mentioned only as a hedge. The genuinely
  GOLD-relevant macro rows (G7 hold, Hormuz) lose affinity to the broad
  tag penalty (n=6–7).
- **SPX500** — 22 candidates, including a today-fresh
  `critical`-impact "US-Iran Hormuz Blockade" row that fails affinity
  with score=−1 (n=14 broad penalty). The chosen row is 6 days old.
- **NVDA / GOOGL / MSFT / SOL/USD / TSLA** — strong on-symbol chosen
  rows exist but the brief takes the *neutral fallback* path because no
  technical signals fired, and that path discards memory context
  unconditionally.
- **AAPL row 0** illustrates the binary-freshness pathology: small
  freshness differences (170h vs 32h) at the same impact and relevance
  produce a hard win/lose flip rather than a graded ordering.

Patterns these point to:

1. Association ranking treats freshness as a binary gate plus a
   tiebreak. There is no graded "fresher rows are worth more relevance"
   signal inside the active window.
2. Surfacing eligibility uses no per-line specificity signal — it
   trusts that an affinity-passing row will produce an on-symbol
   `news_one_liner`, which is empirically not true.
3. The neutral-fallback path is unrelated to context quality; it is a
   *product behavior* that drops context. Treat that separately
   (todo `optional-neutral-fallback`).

---

## A. Association ranking model (recommendation-engine.ts)

**Goal:** define a single, documented ordering used by both
`compareMemoryCandidates` (production) and `fetchMemoryCandidatesForDebug`
(debug). Replace the current "impact -> affinity -> freshness ts ->
relevance" lexicographic sort with a model that is still
lexicographic at the top but has a *graded* secondary key, so that
fresh rows pull ahead of stale rows of equal class.

**Inputs (per candidate row, against the digest symbol):**

| Input | Source | Range | Role |
|---|---|---|---|
| `impactRank` | `impact_level` | 0..3 (critical=0, low=3, unknown=9) | hard primary key |
| `affinityScore` | `computeSymbolAffinity` | typically -1..5 | hard secondary key |
| `freshnessDecay` | `last_updated` | 0..1 | graded multiplier |
| `relevanceScore` | DB column | 0..1 | DB-supplied weight |
| `oneLinerOnSymbol` | regex of aliases against `news_one_liner` | bool | small ranking bonus only |

**Ordering (top-down, all stable / pure / deterministic):**

```text
1. impactRank ASC                                   (hard)
2. affinityScore DESC                               (hard)
3. compositeScore = relevance * freshnessDecay      (graded)
                  + ONELINER_MENTION_BONUS * isOnSymbolOneLiner   DESC
4. last_updated DESC                                (final tiebreak)
```

**Why this shape:**

- Impact and affinity stay hard keys because contamination defence (Step
  3) and curator-stated impact are stronger signals than any continuous
  score we can build on top.
- The composite collapses three correlated weak signals (relevance,
  freshness, one-liner specificity) into a single bounded number so the
  comparator stays trivial and inspectable.
- One-liner-on-symbol is a *bonus*, not a gate, in this layer. It
  expresses a preference, not a veto — so a high-impact, high-affinity
  row whose one-liner is sector-flavored still wins association if no
  on-symbol-line equivalent exists.

**Treat impact-as-hard-key as a hypothesis, not a fixture.** Keeping
`impactRank` as the hard primary is the starting assumption because
curator-stated impact has been the most reliable signal so far. But if
live validation (section "Live validation protocol" below) shows that a
stale `critical` row produces worse user-facing context than a fresh
`high` row in a way that harms digest quality, this is the lever to
adjust — fold `impactWeight × freshnessDecay` into the secondary key,
or demote `impactRank` to a graded weight inside the composite.
Document any such change in the validation decision record alongside
the offending symbol pair, do not retune silently.

**Freshness decay:**

- `freshnessDecay(ageHours) = clamp01( 1 - ageHours / FRESHNESS_HALF_LIFE_HOURS )`
  with `FRESHNESS_HALF_LIFE_HOURS` defaulting to the same window used by
  the in-process freshness gate (`getMemoryFreshnessHours()`, default
  72). Keeps a single env knob.
- Result: 0h -> 1.0, 36h -> 0.5, 72h -> ~0.0.
- The hard window stays in SQL (`fetchTickerMemoryText` already filters
  `last_updated >= NOW() - $hours`), so we never multiply 0 against
  rows that escaped the SQL filter.

**Files touched:**

- [`services/ai/gateway-2.0/src/core/analysis/recommendation-engine.ts`](services/ai/gateway-2.0/src/core/analysis/recommendation-engine.ts)
  — replace `compareMemoryCandidates` body; add a small
  `freshnessDecay()` and `compositeAssociationScore()` helper.
- [`services/ai/gateway-2.0/src/core/analysis/digest-debug.ts`](services/ai/gateway-2.0/src/core/analysis/digest-debug.ts)
  — mirror the new comparator inside `fetchMemoryCandidatesForDebug`
  (kept in lockstep; this was already an explicit invariant).

---

## B. Surfacing eligibility (digest-brief-truth.ts)

**Goal:** decide whether the *winning associated row* is good enough to
become the user-facing `context` line. Today this is a flat
`memoryPassesContextGate` check (impact ∈ {critical, high, medium}
∧ relevance ≥ 0.5 ∧ freshness ≤ 72h). We keep that as the floor and
add a *score-based* layer on top so weak-but-eligible rows get omitted.

**Layered decision (in order):**

1. **Floor (unchanged).** `memoryPassesContextGate` keeps its current
   semantics. If a row fails the floor, it cannot surface. Period.
2. **Surfacing score.** For rows that pass the floor, compute a
   bounded score:
   ```
   surfacingScore = w_impact * impactWeight(impactLevel)
                  + w_relevance * relevanceScore
                  + w_freshness * freshnessDecay(age)
                  + w_oneliner * oneLinerOnSymbol
   ```
   with `impactWeight(critical)=1.0, high=0.8, medium=0.5`,
   `oneLinerOnSymbol` ∈ {0, 1}, weights summing to 1.0. Default
   weights: `0.30, 0.20, 0.20, 0.30`. The constants live in one block
   alongside the existing gate constants and are env-overridable like
   `SMART_DIGEST_MEMORY_FRESHNESS_HOURS`.
3. **Threshold.** `surfacingScore >= SURFACING_MIN` (default 0.55,
   chosen so the AAPL/MSFT/GOLD failure cases above end up below it
   and the BTC/ETH known-good cases stay above it; tuned by tests +
   the live re-run, not by guess).
4. **Macro fallback.** Unchanged structurally. The `MACRO_SENTIMENT_GATE`
   stays at 0.3. The plan deliberately does not retune macro gates
   here — the only macro change is documentation: macro can fire only
   when the per-symbol surfacing decision returned "no", same as today.

**Why one-liner mention is *here* and not in the floor:**

- A hard one-liner-mention gate in the floor would suppress legitimate
  *sector* and *supply-chain* context (e.g. "Auto-tariff escalation
  hits European OEMs" as TSLA context, or "US-Iran Hormuz blockade
  threatens energy assets" as XOM context). That kind of indirect
  context is genuinely useful and we do not have ground truth to
  declare it inadmissible.
- As a *score component*, the same signal still pushes vague,
  non-on-symbol lines below the surfacing threshold when nothing else
  carries the row, while letting strong indirect lines clear the bar
  on the strength of impact + relevance + freshness.

**Output coupling:**

- `BriefDerived.contextSource` gains a fourth value: `"omitted_low_score"`
  to disambiguate "no candidate at all" from "candidate existed, scored
  below threshold". Existing values (`"news_one_liner"`, `"macro"`,
  `"none"`) are unchanged.

**Files touched:**

- [`services/ai/gateway-2.0/src/core/analysis/digest-brief-truth.ts`](services/ai/gateway-2.0/src/core/analysis/digest-brief-truth.ts)
  — add `computeSurfacingScore`, plumbing through aliases; widen
  `BriefDerived.contextSource`; update `deriveContextFromTruth`.
- [`services/ai/gateway-2.0/src/core/analysis/digest-brief-generator.ts`](services/ai/gateway-2.0/src/core/analysis/digest-brief-generator.ts)
  — pass aliases (already trivially derivable from `symbol`) into the
  truth layer.
- [`services/ai/gateway-2.0/src/core/analysis/digest-symbol-affinity.ts`](services/ai/gateway-2.0/src/core/analysis/digest-symbol-affinity.ts)
  — export the existing whole-word matcher so the surfacing layer can
  reuse it without duplicating regex logic. **No scoring change.**

---

## C. Macro restraint (review-only unless evidence demands change)

The live debug shows GOLD's macro context already correctly suppressed
by the existing `MACRO_SENTIMENT_GATE`. SPX500's broad-tag penalty also
works as designed. The only macro-related change in Step 5 is to
document and assert (via test) that:

- macro is *only* consulted when per-symbol surfacing returned "no",
- macro never silently overrides a per-symbol surfacing decision.

If the live re-run after A+B reveals a regression where macro is firing
inappropriately, retune `MACRO_SENTIMENT_GATE` upward in a small
follow-up. **Do not pre-emptively retune.**

---

## D. Debug visibility (digest-debug.ts)

Without these, reviewers cannot validate the new ranking model.

Per `DebugMemoryCandidate`, add:

- `freshnessDecay: number` (0..1)
- `oneLinerMentionsSymbol: boolean`
- `compositeAssociationScore: number`
- `surfacingScore: number` (only meaningful for rows that cleared the
  floor; `null` otherwise)
- `surfacingDecision: "passed_floor_above_threshold"
  | "passed_floor_below_threshold" | "failed_floor" | "not_evaluated"`

Update:

- `annotateWhyLost` — for non-chosen rows, mention composite tie deltas
  ("…tied on impact/affinity, lost composite by 0.07").
- `buildNotes` — when context omitted because the winning row scored
  below `SURFACING_MIN`, add a single human note with the score and
  threshold.
- `inferContextFallback` — return the new `"omitted_low_score"` value
  through to `DebugFallbacks.contextSource`.

**File:** [`services/ai/gateway-2.0/src/core/analysis/digest-debug.ts`](services/ai/gateway-2.0/src/core/analysis/digest-debug.ts).

---

## E. Optional / gated: neutral-fallback context surfacing

Listed last because it is *product behavior expansion*, not context
quality. Today `neutralFallbackBrief()` hard-codes `context: ""` when no
technical signals fire. Surfacing memory context in that path would
materially change what the card looks like for ~80% of weekend symbols.

Plan: **do not include in the Step 5 default scope.** After A+B+D land
and the live re-run confirms the new model is sound, evaluate adding a
single, gated branch:

- only fire when `surfacingScore >= SURFACING_NEUTRAL_MIN` (a *higher*
  threshold than the technical-signal path, e.g. 0.65),
- mark `hasMaterialContext` true only when this path fires,
- keep behind a config flag (`SMART_DIGEST_NEUTRAL_CONTEXT`,
  default off) so rollout is reversible.

If during validation the new ranking model demonstrably surfaces
high-quality on-symbol context for the neutral-path symbols, we flip
the flag in a separate commit. Otherwise it stays off.

This todo is parked under `optional-neutral-fallback` and is not a
prerequisite for declaring Step 5 done.

---

## F. Tests

**File:** [`services/ai/gateway-2.0/src/core/analysis/__tests__/digest-brief-truth.test.ts`](services/ai/gateway-2.0/src/core/analysis/__tests__/digest-brief-truth.test.ts)

- Surfacing score above threshold with on-symbol one-liner -> surfaced.
- Surfacing score below threshold with off-symbol one-liner but passing
  floor -> omitted with `contextSource = "omitted_low_score"`.
- Sector-context case (impact=high, no one-liner mention, fresh) ->
  still surfaces (proves we did not over-suppress indirect context).
- Floor still gates: row with impact=low / relevance=0.3 -> omitted
  regardless of score components.

**File:** [`services/ai/gateway-2.0/src/core/analysis/__tests__/recommendation-engine.test.ts`](services/ai/gateway-2.0/src/core/analysis/__tests__/recommendation-engine.test.ts)

- Two rows, equal impact + affinity, ages 24h vs 60h -> 24h wins.
- Two rows, equal impact + affinity + age, but one's one-liner names
  the symbol -> on-symbol-line wins association.
- Three rows: critical-impact-stale vs high-impact-fresh vs
  medium-impact-fresh -> critical still wins (impact remains hard
  primary).

**File:** [`services/ai/gateway-2.0/src/core/analysis/__tests__/digest-debug.test.ts`](services/ai/gateway-2.0/src/core/analysis/__tests__/digest-debug.test.ts)

- `DebugMemoryCandidate` carries the new fields.
- `surfacingDecision` correctly classifies all four cases.
- `whyLost` mentions composite delta when association tied on
  impact/affinity.

---

## Architectural decisions

- **Deterministic and pure.** Every score is a closed-form function of
  DB-loaded fields plus the digest symbol's alias set. No I/O, no LLM.
- **Inspectability is non-negotiable.** Every new score appears in the
  debug envelope in the same shape as existing fields.
- **Omission > misleading.** When the surfacing score lands below
  threshold, the card emits empty context, not a fallback line.
- **Backwards-compatible delivery.** No schema changes, no card layout
  changes, no Telegram-side changes.
- **Blended mode default unchanged.** Step 5 does not flip
  `SMART_DIGEST_BRIEF_BLEND`. Any blended-vs-strict difference is a
  later rollout question.

---

## Live validation protocol

After implementation:

1. Re-run `POST /internal/debug-digest` on the same 11 symbols
   inspected for this plan.
2. For each, capture (chosenRow.theme, chosenRow.surfacingScore,
   chosenRow.surfacingDecision, brief.context, notes).
3. Diff against the pre-Step-5 captures already in this plan.
4. Pass criteria:
   - AAPL no longer chooses the 170h Berkshire row (or, if it does,
     `surfacingDecision = passed_floor_below_threshold` and context is
     empty rather than misleading).
   - MSFT either chooses a different row or omits context.
   - GOLD's "Pakistan Rupee" row no longer surfaces as GOLD context.
   - BTC/USD and ETH/USD continue to surface their existing on-symbol
     lines (no regression on the cases that already worked).
5. Save the captures under `tmp/validation/<date>/step5-debug/<symbol>.json`
   and write `tmp/validation/<date>/step5-DECISION.md` mirroring the
   shape of `tmp/validation/2026-05-11/step4-DECISION.md`.
6. Explicitly inspect "stale critical vs fresh high" pairings in the
   captures. If any such pair shows the stale critical row producing
   visibly worse user-facing context than the fresh high alternative,
   that is *evidence* for revisiting the impact-as-hard-key assumption
   from section A. Record the affected symbol(s), both row themes, both
   composite/surfacing scores, and the proposed ranking adjustment in
   the decision record before changing code.

---

## Conclusion criterion

Step 5 is "materially better than Step 4" when:

- For the 11-symbol sample, every misleading or stale chosen-and-shown
  context observed in the pre-Step-5 captures is either replaced by a
  better row or correctly omitted (`omitted_low_score`).
- No previously-good context (BTC/USD, ETH/USD) regresses.
- `tsc --noEmit` clean and full vitest suite green.

---

## Deployment Workflow

1. **Baseline check (SSH into VM)**
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` -> Note current image version

2. **Stage and push changes**
   - `git status` -> `git add <file1> <file2> ...` -> `git commit -m "msg" && git push origin main`
   - Never use `git add .` — other agents may have uncommitted changes

3. **Verify build**
   - GitHub Actions: `gh run watch`
   - If frontend modified: `vercel ls --scope=stocktracker`
   - Only proceed when all builds pass
   - Build fails -> `gh run view <run-id> --log` or `vercel logs <url>` -> Fix -> Step 2

4. **Verify VM deployment**
   - SSH -> `docker ps` -> Compare version
   - Version incremented -> Done
   - Version unchanged / container down -> Fix -> Step 2

5. **Done**
