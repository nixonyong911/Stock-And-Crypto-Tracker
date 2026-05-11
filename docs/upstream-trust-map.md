# Upstream Trust Map

Field-by-field trust classification for the three analysis tables that feed Smart Digest.

## `analysis_filtered_news`

Writer: `services/ai/gateway-2.0/src/core/analysis/news-processor.ts`
Migration: `013_add_filtered_news.sql` + `025_filtered_news_provenance.sql`

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

## `analysis_market_memory`

Writer: `services/ai/gateway-2.0/src/core/analysis/memory-curator.ts`
Migration: `015_add_market_memory.sql` + `024_market_memory_news_one_liner.sql` + `026_market_memory_provenance.sql`

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
3. **No primary-subject vs mentioned-ticker distinction** — deferred.
4. **Memory lineage is batch-coarse** — `source_batch_ids` only, no per-row attribution. Deferred.
