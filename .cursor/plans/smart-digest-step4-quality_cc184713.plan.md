---
name: smart-digest-step4-quality
overview: "Improve Smart Digest's selection and composition quality with deterministic, evidence-driven changes: per-signal strength scoring, news_sentiment priority bound to score, degenerate-confidence rescue, fresh-hit vs materially-beyond copy adaptation (current-state only, no temporal claims), and a context length cap. Includes an optional, late-sequenced env-gated context-only neutral fallback (not required for Step 4 success). All changes validated end-to-end via /internal/debug-digest on real symbols."
todos:
  - id: slice-a
    content: "Slice A: per-signal strength + selectPrimary tiebreak + news_sentiment score-bound priority"
    status: completed
  - id: slice-b
    content: "Slice B: confidence rescue via strength + rename confidenceSource news_count_avg -> news_score"
    status: completed
  - id: slice-c
    content: "Slice C: fresh-hit vs materially-beyond target/stop copy (current-state only, no temporal claims) + trimContextLine + apply in deriveContextFromTruth"
    status: completed
  - id: slice-e
    content: "Slice E: extend digest-debug.ts with strength, priorityDemotedFrom, contextTrimmed + new notes"
    status: completed
  - id: slice-f
    content: "Slice F: unit tests for strength, news_score, rescue, trim, fresh-vs-materially-beyond copy, debug fields"
    status: completed
  - id: slice-g
    content: "Slice G: live revalidation against 16 real symbols via /internal/debug-digest, capture tmp/validation/2026-05-11/step4-DECISION.md"
    status: pending
  - id: slice-h
    content: "Slice H: .env.example + short ops note for the new debug fields"
    status: completed
  - id: slice-d
    content: "Slice D (OPTIONAL, late): SMART_DIGEST_NEUTRAL_CONTEXT flag + context-only neutral brief plumbed via config, pipeline, http — not required for Step 4 success"
    status: pending
  - id: deploy
    content: "Deployment workflow: SSH baseline, commit/push, gh run watch, verify VM container version incremented, run Slice G, finalize decision record"
    status: pending
isProject: false
---

## Step 4 — Smart Digest Selection & Composition Quality

### Live debug evidence (May 10, 2026, gateway-2.0 v1.2, 16 real symbols)

Pulled via `POST /internal/debug-digest` against the production VM. Files in `/tmp/digest/*.json`.

- **12 / 16 symbols** (AAPL, TSLA, NVDA, MSFT, GOOGL, SOL, NEAR, DOGE, AVAX, ADA, BNB, SPX500) hit the empty-signal neutral fallback. Several still have fresh `analysis_market_memory` rows that the current fallback discards.
- **GOLD** ships `news_sentiment` at `priority=high` with `confidence=Low (news_count_avg)` — score is 5\*0.39 = 1.95. Priority/confidence mismatch is the canonical "weak signal outranking stronger ones" case.
- **BTC / ETH / META** all show `confidenceSource=degenerate_default` because `analysis_ticker_price_targets.confidence=1.0000`. Confidence is stuck at Medium and conveys no information on the highest-traffic symbols.
- **BTC `whatHappening`**: `"BTC pushed to $80395.52, into the projected target at $76795.25."` — the close is ~4.7 % above target and has been for days, but copy reads as a fresh push.
- **BTC `context`**: ~250 chars, truncates mid-word `"BTC ETF accumulat…"` because there is no sentence-boundary cap.
- `selectPrimary` ranks on `(PRIORITY_ORDER, TYPE_RANK, symbol)` only — no per-signal strength.

### Quality bottlenecks (each maps to a slice below)

Core (required for Step 4 success):

1. `news_sentiment.priority` is count-only — decoupled from strength, contradicts confidence.
2. `degenerate_default` confidence dominates technical signals; no strength rescue.
3. `selectPrimary` lacks strength tiebreak; weak signals can win on TYPE_RANK alone.
4. `target_reached` / `stop_loss_warning` copy reads as a fresh hit even when the close is materially past the level.
5. `context` line has no length cap and no sentence-boundary trim.

Optional (not required for Step 4 success):

6. Empty-signal neutral fallback is overused; affinity-passing memory wasted. Treated as a late, env-gated enhancement (Slice D) because it expands product behavior beyond primary selection/composition quality.

### Decisions taken (per AskQuestion)

- news_sentiment priority: bind to `score = count * |avg|` — `high` when ≥ 6, `medium` when ≥ 4, else `low`. (Core.)
- Neutral fallback: ship behind `SMART_DIGEST_NEUTRAL_CONTEXT`, default OFF, validate via debug. **Optional / late-sequenced**, executed only after the core slices land and Slice G revalidation is captured.

### Truth-grounding rule for copy adaptation

The brief / debug path holds only **today's** `BriefTruth` — `price`, `levels`, and yesterday's `signal_summary` for `signal_change`. There is no multi-day price history in-hand. Therefore copy adaptation rules in this plan MUST only depend on **current-state truth** (e.g., the magnitude of `close/target − 1`) and MUST NOT imply temporal persistence ("for N days", "has been", "sustained over time"). Wording will use present-tense magnitude language only ("is trading at … materially above …", "is well below …").

### Constraints honored

- Fully deterministic. No LLM, no prompt tuning.
- Blended mode stays OFF — neutral-context flag is independent.
- Debug surface only widens, never narrows.
- Levels still DB-truth only; no invented numbers.
- News-context line stays gated by affinity + impact + freshness gates.

---

### Slice A — per-signal strength + ranking

`[services/ai/gateway-2.0/src/core/analysis/digest-brief-truth.ts](services/ai/gateway-2.0/src/core/analysis/digest-brief-truth.ts)`

- Add `BriefDerived.signalStrength: number` in `[0,1]`, computed from existing `truth` fields. No new DB columns.
- Strength formulas (all clamped to `[0,1]`):
  - `target_reached`: `min(1, |close/target − 1| * 10)`. Fresh hit ≈ 0; 10 % above ≈ 1.
  - `stop_loss_warning`: `min(1, |close/stop − 1| * 10)` mirrored.
  - `entry_zone`: `1 − |close − midZone| / (zoneHalfWidth || 1)` where mid is `(entryLow+entryHigh)/2`. Falls back to 0.5 when only one bound exists.
  - `momentum_shift`: `min(1, |macdHistogram| / (price*0.005))` (asset-scale-aware; price always positive when this fires).
  - `signal_change`: 1.0 if prev/curr both directional and opposite; 0.7 same-side; 0.4 involves neutral.
  - `notable_pattern`: `truth.signalFacts.patternConfidence ?? 0.5`. Needs a small expansion in `gatherTruth` to expose `patternConfidence` from `signal.rawData.patterns[0].confidence`.
  - `news_sentiment`: `min(1, (count * |avg|) / 8)`.
  - default / missing facts: 0.
- Update `selectPrimary` in `[digest-brief-generator.ts](services/ai/gateway-2.0/src/core/analysis/digest-brief-generator.ts)` to `(PRIORITY_ORDER, signalStrength DESC, TYPE_RANK, symbol)`. TYPE_RANK kept as last-resort deterministic tiebreak.
- `[recommendation-engine.ts](services/ai/gateway-2.0/src/core/analysis/recommendation-engine.ts)` `detectNewsSentimentSignals`: replace `priority: count >= 5 ? "high" : "medium"` with score-bound priority:

```ts
const score = count * Math.abs(avg);
const priority: TickerSignal["priority"] =
  score >= 6 ? "high" : score >= 4 ? "medium" : "low";
```

### Slice B — confidence rescue + source rename

`[digest-brief-truth.ts](services/ai/gateway-2.0/src/core/analysis/digest-brief-truth.ts)` `deriveConfidenceFromTruth`:

- When the existing degenerate path would return `Medium / degenerate_default`, consult `signalStrength`:
  - `strength ≥ 0.6` → `confidence: "High"`, `confidenceSource: "strength_from_signal"`.
  - `strength ≥ 0.3` → `confidence: "Medium"`, `confidenceSource: "strength_from_signal"`.
  - otherwise → keep `Medium / degenerate_default` (legacy behavior).
- `news_sentiment` confidence already tied to score — rename `confidenceSource: "news_count_avg" → "news_score"` for clarity. Update all callers and tests; document the rename in the BriefDerived JSDoc.

### Slice C — composition copy: fresh-hit vs materially-beyond (current-state only) + context cap

`[digest-brief-truth.ts](services/ai/gateway-2.0/src/core/analysis/digest-brief-truth.ts)` `buildWhatHappeningSentence`. All wording is derived from current-state truth only (`price`, `levels`). No temporal claim like "for N days" or "has been" — the brief path does not hold the history that would justify those words.

- `target_reached`: branch on **current** magnitude of `close/target − 1`:
  - When `> 0.03` (close is materially above the projected target right now): "`${sym} is trading at $${close}, ~${pct}% above its projected target of $${target}.`"
  - Otherwise (close at or just past the target): keep current "`${sym} pushed to $${close}, into the projected target at $${target}.`"
- `stop_loss_warning`: mirror on the magnitude of `close/stop − 1`:
  - When `< -0.03` (close is materially below the stop right now): "`${sym} is trading at $${close}, ~${pct}% below its stop level at $${stop}.`"
  - Otherwise: keep current "`${sym} is at $${close}, pressing the stop-loss at $${stop}.`"
- `news_sentiment`: when `signalStrength < 0.3`, prefix with `"Limited: "` so a Low-confidence headline reads as informational, not actionable.
- New helper `trimContextLine(line: string): { text: string; trimmed: boolean }`:
  - Take the longest prefix ending at `.`, `!`, or `?` that fits within 180 chars.
  - If no such boundary exists, hard-cut at 160 chars and append `"…"`.
- Apply in `deriveContextFromTruth` to both `news_one_liner` and macro fallback branches. Expose `derived.contextTrimmed: boolean` so the debug surface can flag rows that were trimmed.

### Slice E — debug surface widens (core)

`[digest-debug.ts](services/ai/gateway-2.0/src/core/analysis/digest-debug.ts)`:

- `CandidateSummary` gains `strength: number` and `priorityDemotedFrom?: TickerSignal["priority"]` (always populated for news_sentiment when default-by-count and bound-by-score disagree).
- `CandidateRanking.rationale` mentions strength-ordered ties.
- `BriefDerived` already carries `signalStrength` / `confidenceSource` — debug echoes them as-is. New `contextTrimmed` flag surfaced from `derived`.
- `buildNotes` adds:
  - `"news_sentiment demoted to ${priority} (score=${score})"` when demotion happened.
  - `"confidence rescued by signal strength ${strength.toFixed(2)}"` when path is `strength_from_signal`.
  - `"context trimmed: ${origLen}→${trimmedLen} chars"` when `contextTrimmed`.
- Slice-D-only additions (defer until Slice D is greenlit): `DebugFallbacks.neutralContextUsed` / `neutralContextSource`, and the matching `"neutral-context fallback used …"` note. Not added in the core pass.

### Slice F — tests (core)

All under `services/ai/gateway-2.0/src/core/analysis/__tests__/`.

- `digest-brief-truth.test.ts`:
  - Strength for each signal type with boundary inputs (missing target/stop, zero MACD, zero count\*avg, full-confidence pattern).
  - `news_score` rename + score buckets 0/3/5/7/10.
  - `strength_from_signal` rescue path with `rawConfidence=1.0`, `strength=0.7`.
  - `trimContextLine` sentence-boundary, hard-cap, no-boundary cases.
- `digest-brief-generator.test.ts`:
  - `selectPrimary` picks higher-strength same-priority candidate.
  - `news_sentiment` demoted to low at score 1.95 still selected when sole candidate; demoted candidate loses to a same-priority technical (with strength).
  - Fresh-hit vs materially-beyond `target_reached` and `stop_loss_warning` copy at 1 %, 3 %, 5 % gaps — wording asserts present-tense only, no temporal claim.
- `digest-debug.test.ts`:
  - New `strength`, `priorityDemotedFrom`, `contextTrimmed` fields populate correctly.
  - Notes contain the new lines when the conditions fire.

### Slice G — live revalidation against the same 16 symbols (core)

After deploy of the core slices (A, B, C, E, F), refresh the same 16-symbol pull (`AAPL, TSLA, NVDA, MSFT, GOOGL, META, GOLD, SPX500, BTC/USD, ETH/USD, SOL/USD, NEAR/USD, DOGE/USD, BNB/USD, AVAX/USD, ADA/USD`) and confirm:

- GOLD: `news_sentiment` priority is now `low` (score 1.95) → primary stays news_sentiment (only candidate), confidence stays Low, but priority/confidence are coherent.
- BTC/ETH: `confidenceSource ∈ {strength_from_signal, raw_confidence}`, no longer `degenerate_default`. BTC `whatHappening` uses the materially-beyond present-tense wording. BTC `context` ≤ 180 chars, ends at a sentence boundary.
- META: behavior unchanged (already healthy).

Capture as `tmp/validation/2026-05-11/step4-DECISION.md` (mirrors the step-3 decision record). This is the gate for declaring Step 4 successful; Slice D is **not** required for this decision to be positive.

### Slice H — env + docs (core)

- `RUNBOOK.md` or `docs/`: short note on the new debug fields (`strength`, `priorityDemotedFrom`, `contextTrimmed`, `confidenceSource=strength_from_signal|news_score`) — one paragraph.
- `.env.example` change deferred to Slice D.

---

### Slice D — context-only neutral fallback (OPTIONAL, env-flagged, default OFF, executed AFTER Slice G)

**Status:** optional. Step 4 is considered successful purely on the core slices (A, B, C, E, F, G, H). Slice D is a late-sequenced product-behavior expansion that surfaces affinity-passing memory under a Neutral brief shape; it does not improve primary selection or composition for symbols that already have signals. Run only after Slice G's decision record confirms the core changes are healthy in prod.

`[services/ai/gateway-2.0/src/config.ts](services/ai/gateway-2.0/src/config.ts)`:

- New `smartDigestNeutralContext: boolean`, read from `SMART_DIGEST_NEUTRAL_CONTEXT` (default `false`).

`[digest-brief-generator.ts](services/ai/gateway-2.0/src/core/analysis/digest-brief-generator.ts)`:

- New arg `neutralContextEnabled?: boolean`.
- When `signals.length === 0` AND flag ON AND `memoryText` passes `memoryPassesContextGate` AND affinity already filtered upstream:
  - Stance stays `Neutral / neutral`. Confidence stays `Low`.
  - `whatHappening = "No active technical signal — top story today on ${sym}:"` (deterministic prefix).
  - `context = trimContextLine(memoryText.newsOneLiner).text`.
  - `hasMaterialContext = true`.
- All level fields stay em-dash. No invented numbers.

`[digest-pipeline.ts](services/ai/gateway-2.0/src/core/analysis/digest-pipeline.ts)` and `[http/recommendations.ts](services/ai/gateway-2.0/src/http/recommendations.ts)`: thread `neutralContextEnabled` into the generator call from `config.smartDigestNeutralContext`.

Slice D debug additions (deferred from Slice E): `DebugFallbacks.neutralContextUsed: boolean`, `DebugFallbacks.neutralContextSource: "news_one_liner" | "none"`, and the matching `"neutral-context fallback used …"` note.

Slice D tests: `generateDigestBrief` flag-off behavior unchanged; flag-on neutral-context shape (Neutral, Low, context populated, levels em-dash). `digest-debug.test.ts` asserts the new `neutralContext*` debug fields populate.

Slice D env + docs: `.env.example` adds `SMART_DIGEST_NEUTRAL_CONTEXT=false` with comment; RUNBOOK note extended to mention the flag.

Slice D validation: rerun the 16-symbol pull with `SMART_DIGEST_NEUTRAL_CONTEXT=true` and confirm that at least 5 of the previously-bald-neutral symbols (AAPL, MSFT, GOOGL, SOL, BNB candidates) ship a populated `context` line. Append findings to the Slice G decision record under a separate "Slice D (optional) — outcome" heading.

### Out of scope (explicit)

- No LLM. No prompt tuning. No blended-mode default change.
- No new DB columns. No new MCP tools.
- Card renderer untouched.
- Affinity gate untouched (step 3 already validated).

### Conclusion criteria (will go into the decision record)

Step 4 is materially better than step 3 when, against the same 16-symbol pull, **all of the following hold from the core slices alone** (Slice D not required):

- Zero `confidenceSource=degenerate_default` on signals where `signalStrength ≥ 0.6`.
- Zero `priority=high, confidence=Low` cases on news_sentiment.
- All context lines ≤ 180 chars and end at a sentence boundary (or hard-cut with `"…"`).
- `target_reached` / `stop_loss_warning` copy uses present-tense materially-beyond wording when `|close/level − 1| > 0.03`, and the fresh-hit wording otherwise. No temporal claims in either branch.

Optional bonus (Slice D, recorded but not gating):

- With `SMART_DIGEST_NEUTRAL_CONTEXT=true`, at least 5 previously-bald-neutral symbols ship a populated context line under Neutral stance.

---

## Deployment workflow

1. **Baseline check (SSH into VM)**
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → Note current image version (current: `stocktracker-gateway-2.0:v1.2`).

2. **Stage and push changes**
   - `git status` → `git add <file1> <file2> ...` → `git commit -m "msg" && git push origin main`
   - Never use `git add .` — other agents may have uncommitted changes.

3. **Verify build**
   - GitHub Actions: `gh run watch`
   - If frontend modified: `vercel ls --scope=stocktracker` (not expected this step).
   - Only proceed when all builds pass.
   - Build fails → `gh run view <run-id> --log` or `vercel logs <url>` → Fix → Step 2.

4. **Verify VM deployment**
   - SSH → `docker ps` → Compare version (`stocktracker-gateway-2.0:` should increment past `v1.2`).
   - Version incremented → Done.
   - Version unchanged / container down → Fix → Step 2.

5. **Done** — run Slice G revalidation, commit the decision record.
