---
name: smart-digest-card-shape
overview: Add a new digest-brief-generator that outputs a compact, card-shaped DigestBrief mapping 1:1 onto the renderer's CardData. Switch Smart Digest call sites to the new generator without aggressively deleting legacy code. End with a one-shot verification that renders four briefs through card-renderer.ts and DMs them to the requested Telegram user.
todos:
  - id: extend-engine
    content: "Extend recommendation-engine.ts: add latest_open to PriceTargetRow / TickerCtx / TickerSignal.rawData.latestOpen and fetchPriceTargets SQL"
    status: completed
  - id: add-brief-generator
    content: "Create new file digest-brief-generator.ts (alongside the existing explanation-generator.ts): DigestBrief type, simple stance map (4 labels), 3-bucket confidence, deterministic template helpers for whatHappening / whatToWatch / context, generateDigestBrief entry point. Template-first — no LLM in the first pass."
    status: completed
  - id: update-fanout
    content: Update fanOutToWatchers in recommendations.ts to call generateDigestBrief, persist the brief as JSON in user_recommendation_log.message_body, and stop calling telegram.sendText. Drop formatRecommendation import locally.
    status: completed
  - id: update-force-send
    content: Update /internal/force-send-digest to run the real brief-generation path and return { ok, brief } in the response. Stop calling telegram.sendText. Drop formatRecommendation import locally.
    status: completed
  - id: remove-welcome-insight
    content: Remove the welcome-insight try-block in extensions/telegram/commands/add.ts (drop unused formatRecommendation/generateExplanation imports here). The plain '/add' reply remains.
    status: completed
  - id: tests
    content: Add __tests__/digest-brief-generator.test.ts covering deriveStance, deriveConfidence, whatToWatch level fallbacks, context optionality, and the public generateDigestBrief signature. Leave existing explanation-generator/digest-formatter test files intact (legacy).
    status: completed
  - id: verification-script
    content: "Add scripts/verify-digest-cards.ts: build 4 briefs (stock/crypto x with/without context), render via renderCard, sendPhoto to nixonyong911 (clerk user_3AFKJYB2MSQhD6qwtyU9UAc9nyL)."
    status: completed
  - id: deploy-and-verify
    content: Run standard deployment workflow + execute verify script and confirm 4 cards delivered to nixonyong911
    status: in_progress
isProject: false
---

## Goal

Make Smart Digest generation output a structured object that mirrors `CardData` in [card-renderer.ts](services/ai/gateway-2.0/src/core/analysis/card-renderer.ts), with compact wording matching the showcase in [anatomy-section.tsx](services/frontend/src/components/sections/home/anatomy-section.tsx). Switch the live Smart Digest path to it. The legacy long-form generator/formatter stays on disk (unused by the digest flow) so this rollout is reviewable and easy to roll back. Card wiring stays a future step — but we will do a one-shot verification at the end.

## Guiding principles for this rewrite

- **Single phase, low blast radius.** New file, swap call sites, ship.
- **Template-first, deterministic.** Every brief field has a concrete fallback rule. No LLM dependency in the first pass.
- **Don't aggressively delete history.** Stop _using_ the old long-form formatter inside the digest path; do not make hard deletion the success condition.
- **Clarity over taxonomy.** Small, stable label vocab.

## Target data shape

New type in `digest-brief-generator.ts`, field-for-field aligned with `CardData`:

```ts
export type DigestStanceTone = "watch" | "trigger" | "neutral";

export interface DigestBrief {
  ticker: string;
  status: { label: DigestStanceLabel; tone: DigestStanceTone };
  price: number;
  changePercent: number;
  confidence: "High" | "Medium" | "Low";
  updatedAt: Date;
  whatHappening: string;
  whatToWatch: { holdAbove: string; breakBelowTarget: string };
  context: string;
  hasMaterialContext: boolean;
}
```

### Simplified stance vocab

Four user-facing labels — `Triggered` is intentionally dropped from the default mapping to keep things tight. It can be added later if a clear use case emerges.

| Label        | Tone      | When                                                                                       |
| ------------ | --------- | ------------------------------------------------------------------------------------------ |
| Watch zone   | `watch`   | `entry_zone`, `notable_pattern`, `news_sentiment`                                          |
| Constructive | `trigger` | `target_reached`, bullish `signal_change`, bullish `momentum_shift`                        |
| Caution      | `watch`   | `stop_loss_warning`, bearish `signal_change`, bearish `momentum_shift`, conflict alignment |
| Neutral      | `neutral` | fallback when nothing above fits                                                           |

## Files to change

### New

- `services/ai/gateway-2.0/src/core/analysis/digest-brief-generator.ts`
- `services/ai/gateway-2.0/src/core/analysis/__tests__/digest-brief-generator.test.ts`
- `services/ai/gateway-2.0/scripts/verify-digest-cards.ts`

### Modify

- [recommendation-engine.ts](services/ai/gateway-2.0/src/core/analysis/recommendation-engine.ts) — extend `PriceTargetRow`, `TickerCtx`, and `fetchPriceTargets` to carry `latest_open`. Surface `latestOpen` on `TickerSignal.rawData` so the brief generator can compute `changePercent`.
- [recommendations.ts](services/ai/gateway-2.0/src/http/recommendations.ts) — `fanOutToWatchers` and `/internal/force-send-digest` switch to `generateDigestBrief`. Both stop calling `telegram.sendText`. The brief is persisted as JSON in `user_recommendation_log.message_body`. Drop the local `formatRecommendation` import.
- [add.ts](services/ai/gateway-2.0/src/extensions/telegram/commands/add.ts) — remove the welcome-insight block; drop the local `formatRecommendation`/`generateExplanation` imports here.

### Left intact (legacy on disk, unused by the digest path)

- [explanation-generator.ts](services/ai/gateway-2.0/src/core/analysis/explanation-generator.ts)
- [digest-formatter.ts](services/ai/gateway-2.0/src/core/analysis/digest-formatter.ts)
- The two existing legacy test files

These files stop being imported from the digest flow but remain in the tree. Cleanup can be a separate, isolated PR once the new path is proven in prod.

## Brief generation rules — template-first

`generateDigestBrief(signals, ctx, macroContext, newsOneLinerMap)` is fully deterministic. No LLM call is required for the first pass — every field has a concrete derivation rule:

- **status** — `deriveStance(primarySignal)` returns `{ label, tone }` from the table above using signal type + `timeframeAlignment`.
- **price** — `primary.rawData.close`.
- **changePercent** — `((close - latestOpen) / latestOpen) * 100`, fallback `0` when `latestOpen` is missing.
- **confidence** — collapse the existing four-bucket scale to three: `Low-Medium → Low`, otherwise unchanged.
- **updatedAt** — `new Date()` at generation.
- **whatHappening** — single short sentence keyed by signal type (no paragraph stacking, no "across all timeframes" filler, no RSI tack-ons). Multi-signal cases pick the highest-priority signal as the dominant driver.
  - `entry_zone`: "Pullback into the prior breakout zone after a multi-week run."
  - `target_reached`: "Pushing into projected resistance as buyers stay engaged."
  - `stop_loss_warning`: "Price is testing the lower edge of its recent range."
  - `signal_change` bullish: "Trend has flipped from bearish to bullish on the swing timeframe."
  - `momentum_shift` bullish: "Short-term momentum has rolled positive."
  - `notable_pattern`: "{Pattern} formed today, often a {signal} reversal cue."
  - `news_sentiment`: "Recent coverage has skewed {bullish|bearish} across {n} stories."
- **whatToWatch** — derive two levels via shared `fmtPrice`:
  - `holdAbove` = `entryLow` → `periodLow` → `ema20`.
  - `breakBelowTarget` = `stopLoss` → `periodLow * 0.97` → `entryLow * 0.97`.
- **context** — optional one-liner, only when materially additive:
  - `newsOneLinerMap` entry takes priority.
  - Otherwise derive from `macroContext` only when `dominantTheme != null` AND `|overallSentiment| >= 0.2`.
  - Otherwise `context = ""`, `hasMaterialContext = false`.

### LLM is NOT part of the first pass

The LLM enhancer is explicitly **out of scope** for this plan. Once the deterministic path is shipped and observed, a follow-up plan can add an opt-in enhancement layer that polishes `whatHappening` / `context` while preserving the deterministic fallback. Success here does not depend on any prompt or JSON-parsing quality.

## Call-site changes

### `fanOutToWatchers` ([recommendations.ts](services/ai/gateway-2.0/src/http/recommendations.ts))

```ts
const brief = generateDigestBrief(signals, macroContext, newsOneLinerMap);
// dedup + per-user cap unchanged
// no telegram.sendText() — persist only
await db.query(
  `INSERT INTO user_recommendation_log
   (clerk_user_id, ticker_symbol, recommendation_type, priority, headline, message_body, timeframe_alignment)
   VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [
    watcher.clerk_user_id,
    primary.symbol,
    primary.type,
    primary.priority,
    primary.headline,
    JSON.stringify(brief),
    primary.timeframeAlignment,
  ],
);
```

### `/internal/force-send-digest`

Runs the **same real generation path** as `fanOutToWatchers` (no debug-only branch). Returns the generated brief in the HTTP response so operators can quickly validate output for any clerk user / symbol pair:

```ts
const brief = generateDigestBrief(signals, macroContext, newsOneLinerMap);
// persist to user_recommendation_log (same INSERT as above)
return reply.send({ ok: true, brief });
```

This keeps the endpoint a true end-to-end probe of the live path while also being usable as a quick JSON preview.

### `/add` welcome-insight

Remove the `try { ...detectSignalsForTicker → generateExplanation → formatRecommendation → ctx.reply... } catch` block. The plain "added to your watchlist" reply remains. No behavioural replacement is added — the welcome-insight is simply retired with the legacy formatter.

## Tests

- New `__tests__/digest-brief-generator.test.ts`:
  - `deriveStance` returns the four expected labels for the documented signal/alignment combos.
  - `deriveConfidence` collapses `Low-Medium` to `Low` and preserves `High` / `Medium`.
  - `whatToWatch` falls back through `entryLow → periodLow → ema20` and `stopLoss → periodLow * 0.97 → entryLow * 0.97`.
  - `context` is `""` and `hasMaterialContext` is `false` when neither news nor a strong macro theme is present.
  - `generateDigestBrief` returns a valid `DigestBrief` for representative single-signal and multi-signal inputs.
- Legacy tests: leave `__tests__/explanation-generator.test.ts` and `__tests__/digest-formatter.test.ts` untouched. They keep passing because the legacy modules are still on disk; they just no longer cover the digest path.

## Verification step (one-shot)

`scripts/verify-digest-cards.ts`:

1. Construct **four** `DigestBrief` fixtures using the real `generateDigestBrief` helpers (no hardcoded prose):
   - **Stock + with context** — AAPL `Watch zone`, news one-liner present.
   - **Stock + without context** — TSLA `Caution`, `context = ""`.
   - **Crypto + with context** — BTC/USD `Constructive`, macro-derived context.
   - **Crypto + without context** — ETH/USD `Neutral`, `context = ""`.
2. Pass each brief directly to `renderCard(brief)` — the brief shape is already `CardData`-compatible (`context: ""` is permitted by the renderer).
3. Resolve the chat id for clerk user `user_3AFKJYB2MSQhD6qwtyU9UAc9nyL` (nixonyong911) from `channel_accounts`, reusing the pattern in [send-sample-card.ts](services/ai/gateway-2.0/scripts/send-sample-card.ts), and `sendPhoto` each PNG via `https://api.telegram.org/bot{TOKEN}/sendPhoto`.

Run:

```
infisical run --env=dev -- npx tsx scripts/verify-digest-cards.ts
```

## Out of scope

- No changes to [card-renderer.ts](services/ai/gateway-2.0/src/core/analysis/card-renderer.ts).
- No changes to the website ([anatomy-section.tsx](services/frontend/src/components/sections/home/anatomy-section.tsx), [smart-digest-content.tsx](services/frontend/src/app/[locale]/smart-digest/smart-digest-content.tsx)).
- No changes to dedup keys, daily caps, scheduler crons, or `user_recommendation_log` schema.
- No LLM enhancer in this pass (deterministic templates only).
- No deletion of `explanation-generator.ts` / `digest-formatter.ts` — left for a separate cleanup PR.
- No production card wiring — that's the next plan.

## Standard deployment workflow

1. Baseline check (SSH into VM)
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → note current image version
2. Stage and push changes
   - `git status` → `git add <file1> <file2> ...` → `git commit -m "msg" && git push origin main`
   - Never use `git add .`
3. Verify build
   - `gh run watch`
   - Build fails → `gh run view <run-id> --log` → fix → step 2
4. Verify VM deployment
   - SSH → `docker ps` → version incremented → done
   - Else → fix → step 2
5. Run verification script (`scripts/verify-digest-cards.ts`) and confirm 4 cards arrive in Telegram for nixonyong911.
6. Done.
