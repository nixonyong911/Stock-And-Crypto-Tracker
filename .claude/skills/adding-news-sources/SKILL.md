---
name: adding-news-sources
description: Use when adding a new news data source, integrating a news API, creating unfiltered_news tables, or connecting a new news feed into the LLM processing and market memory pipeline
---

# Adding News Sources

## Overview

The news pipeline has three layers: **Unfiltered → Filtered → Market Memory**. Adding a new source means creating the unfiltered table, wiring the data-fetcher worker, and connecting to the existing LLM pipeline. The filtered and memory layers require zero new code — they consume from a shared SQL view.

## Architecture

```
[Data Fetcher (.NET)]          [Gateway 2.0 (TypeScript)]
  ┌─────────────┐               ┌──────────────────┐
  │ Source Worker│──fetch──►DB──►│ News Processor    │──►analysis_filtered_news
  │ (cron)      │               │ (LLM: sonnet)     │         │
  └──────┬──────┘               └──────────┬────────┘         ▼
         │                                 │          ┌───────────────┐
         ▼                                 └─────────►│Memory Curator │
  unfiltered_news_<source>                            │(LLM: thinking)│
         │                                            └───────┬───────┘
         ▼                                                    ▼
  unfiltered_news_combined (SQL view)              analysis_market_memory
                                                   (single source of truth)
```

## Step-by-Step Integration Checklist

### Step 1: Database Migration

Create `services/workers/data-fetcher-2.0/migrations/<NNN>_add_<source>.sql`:

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS unfiltered_news_<source> (
    id              BIGSERIAL   PRIMARY KEY,
    <source>_id     VARCHAR(255) NOT NULL UNIQUE,  -- external ID for dedup
    title           TEXT         NOT NULL,
    description     TEXT,
    content_excerpt TEXT,
    url             TEXT,
    source_name     VARCHAR(255),
    published_at    TIMESTAMPTZ  NOT NULL,
    search_category VARCHAR(50),
    key_points      TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_<source>_published
    ON unfiltered_news_<source> (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_<source>_created
    ON unfiltered_news_<source> (created_at DESC);

COMMIT;
```

**Critical columns the pipeline requires:**
- `title` — used by news processor for dedup and LLM input
- `description` — LLM context
- `published_at` — article publish time
- `created_at` — when we fetched it (used for lookback queries)

Optional columns (source-specific): `sentiment_label`, `avg_sentiment_score`, `language`, `entities`, etc.

### Step 2: Update the Combined View

Modify migration to recreate `unfiltered_news_combined`:

```sql
CREATE OR REPLACE VIEW unfiltered_news_combined AS
  -- existing marketaux SELECT ...
  UNION ALL
  -- existing gnews SELECT ...
  UNION ALL
  SELECT
    '<source>'::text          AS source_api,
    <source>_id               AS external_id,
    title,
    description,
    content_excerpt,
    url,
    source_name,
    published_at,
    search_category,
    key_points,
    NULL::numeric             AS avg_sentiment_score,  -- or actual column
    NULL::varchar             AS sentiment_label,      -- or actual column
    created_at
  FROM unfiltered_news_<source>;
```

**The view columns must match exactly:** `source_api`, `external_id`, `title`, `description`, `content_excerpt`, `url`, `source_name`, `published_at`, `search_category`, `key_points`, `avg_sentiment_score`, `sentiment_label`, `created_at`.

Use `NULL::type` for columns the source doesn't have.

### Step 3: Data Fetcher Worker (.NET)

Create worker in `services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Workers/<SourceName>/`:

Required files (follow GNews or MarketAux pattern):
- `<Source>Worker.cs` — BackgroundService with schedule loop
- `I<Source>FetchService.cs` — fetch interface
- `<Source>FetchService.cs` — API client + store logic
- `I<Source>Repository.cs` / `<Source>Repository.cs` — DB operations

**Key behavior the worker MUST implement:**
1. Read schedule from `worker_fetch_schedules` table
2. Fetch articles from API
3. Insert into `unfiltered_news_<source>` with upsert (ON CONFLICT DO NOTHING on external ID)
4. On success, call `gatewayNotifier.NotifyProcessNewsAsync(stoppingToken)` — **this triggers the full LLM pipeline**
5. Update schedule status via `fetchScheduleRepo.UpdateLastRunAsync()`

```csharp
// After successful fetch — THIS LINE TRIGGERS THE PIPELINE
if (status == "success")
{
    var gatewayNotifier = fetchScope.ServiceProvider
        .GetRequiredService<IGatewayAlertNotifier>();
    await gatewayNotifier.NotifyProcessNewsAsync(stoppingToken);
}
```

**Register the worker** in `Program.cs` / DI container.

### Step 4: Add Fetch Schedule

Insert into `worker_fetch_schedules` on the VM:

```sql
INSERT INTO worker_fetch_schedules
  (data_source_id, name, description, schedule_time, is_enabled,
   interval_minutes, offset_minutes, schedule_timezone)
VALUES
  (<id>, '<Source> News Fetch', 'Fetches news from <Source> API',
   '00:00:00', true, 480, 120, 'UTC');
```

Choose `interval_minutes` and `offset_minutes` to avoid overlap with existing schedules:
- MarketAux: every 360 min, offset 180
- GNews: every 480 min, offset 0

### Step 5: Freshness Monitoring

Add entry in `scripts/freshness-check/src/table-config.ts`:

```typescript
{
  table: "unfiltered_news_<source>",
  timestampColumn: "created_at",
  maxAgeMinutes: 600,  // adjust based on fetch interval
  description: "Unfiltered news from <Source>",
},
```

Update expected count in `scripts/freshness-check/tests/table-config.test.ts`.

### Step 6: Run Migration on VM

```bash
ssh azureuser@<VM_IP>
sudo docker exec postgres psql -U postgres -d stocktracker -f /path/to/migration.sql
# Or paste the SQL directly:
sudo docker exec postgres psql -U postgres -d stocktracker -c "<SQL>"
```

### Step 7: Deploy & Verify

Follow the standard deployment workflow:

1. `git add <specific files>` → `git commit` → `git push origin main`
2. `gh run watch` — wait for tests + deploy to pass
3. SSH → `docker ps` → verify data-fetcher restarted
4. Wait for first fetch cycle, then check:

```sql
-- Verify articles stored
SELECT COUNT(*), MAX(created_at) FROM unfiltered_news_<source>;

-- Verify combined view includes new source
SELECT source_api, COUNT(*) FROM unfiltered_news_combined GROUP BY source_api;

-- Verify LLM pipeline processed them
SELECT source_api, COUNT(*) FROM (
  SELECT jsonb_array_elements(source_articles::jsonb)->>'source_api' AS source_api
  FROM analysis_filtered_news
  WHERE processed_at >= NOW() - INTERVAL '6 hours'
) sub GROUP BY source_api;

-- Verify market memory updated
SELECT COUNT(*), MAX(last_updated) FROM analysis_market_memory WHERE status = 'active';
```

## What You Do NOT Need to Change

These components automatically pick up new sources via the shared view/tables:

| Component | Why it works |
|-----------|-------------|
| `news-processor.ts` | Reads from `unfiltered_news_combined` view — new source appears automatically |
| `memory-curator.ts` | Reads from `analysis_filtered_news` — fed by news processor |
| `market-overview.ts` | Reads from `analysis_market_memory` |
| `recommendation-engine.ts` | Reads from `analysis_market_memory` |
| MCP tools (`news.py`) | Reads from `analysis_market_memory` |
| Daily overview broadcaster | Reads from `analysis_market_memory` |
| Digest scheduler | Triggers existing cron jobs |

**The only code you write is the migration, the view update, and the .NET worker.**

## Telegram Notifications

The notification system auto-includes source breakdown. After integration, notifications show:

```
--- NEWS PROCESSING ---
Source: marketaux (32), gnews (64), <newsource> (25)
Input articles: 75
Output stories: 14
...
```

This happens because `news-processor.ts` counts articles by `source_api` from the combined view. No code change needed.

## Operational Considerations

### Redis Dedup Lock

The news processing lock (`news:processing:lock`, 30 min TTL) prevents concurrent runs. If your new source's fetch cycle finishes while a previous source's pipeline is still running, it will be skipped. Articles won't be lost — the next pipeline run picks them up via `created_at` lookback.

**If pipeline was skipped and you need immediate processing:**
```bash
sudo docker exec redis redis-cli DEL news:processing:lock memory:curator:lock
```

### Lookback Windows

| Component | Lookback | Column Used |
|-----------|----------|-------------|
| News Processor | 12 hours | `created_at` |
| Memory Curator | 3 hours | `processed_at` |

New source articles are picked up if fetched within the processor's 12-hour window. Ensure fetch interval < 12 hours.

### Article Caps

| Component | Cap | Behavior |
|-----------|-----|----------|
| News Processor | 75 articles | Most recent 75 after dedup, ordered by `published_at` |
| Memory Curator | 25 stories | Most recent 25 from `analysis_filtered_news` |

More sources = more articles competing for the 75-article cap. If total volume exceeds cap consistently, consider increasing `MAX_ARTICLES` in `news-processor.ts` or reducing fetch frequency.

## Troubleshooting Guide

### Data Accumulation

**Symptom:** Tables growing, queries slowing.

**Prevention:** Each worker should clean up old articles:
```csharp
result.CleanedUp = await newsRepo.CleanupOldArticlesAsync(30); // 30-day retention
```

**Recovery:**
```sql
DELETE FROM unfiltered_news_<source> WHERE created_at < NOW() - INTERVAL '30 days';
VACUUM ANALYZE unfiltered_news_<source>;
```

### LLM Timeout

**Symptom:** `"News processing failed"` or `"Curator LLM call timed out"` in gateway logs.

**Cause:** Too many articles or themes in context.

**Check:**
```bash
sudo docker logs gateway-2.0 --since 30m 2>&1 | grep -i 'timed out\|failed\|Prepared'
```

**Fix:** Reduce article volume. Current caps:
- `MAX_ARTICLES = 75` in `news-processor.ts`
- `MAX_STORIES_FOR_CURATOR = 25` in `memory-curator.ts`
- `LLM_TIMEOUT_MS = 180_000` (processor) / `480_000` (curator)

### Truncated Theme IDs

**Symptom:** `"invalid input syntax for type uuid"` in curator logs.

**Cause:** LLM sometimes returns shortened theme_ids.

**Already handled:** `resolveThemeIds()` in `memory-curator.ts` does prefix matching. If it still fails, check that the theme_id prefix is unique across active themes.

### Pipeline Skipped (Lock Contention)

**Symptom:** `"News processing skipped — another run is in progress or recently completed"`.

**Cause:** Multiple fetch cycles completing within the 30-min lock window.

**Check:**
```bash
sudo docker exec redis redis-cli TTL news:processing:lock
```

**Fix:** Clear lock manually or wait for TTL expiry. Not a bug — articles are processed on the next unlocked run.

### Source Not Appearing in Notifications

**Symptom:** Notification shows other sources but not the new one.

**Checklist:**
1. Is the combined view updated? `SELECT DISTINCT source_api FROM unfiltered_news_combined;`
2. Are articles within the 12-hour `created_at` window?
3. Is `published_at` populated? (NULL values sort differently)
4. Are articles being deduped? Check for duplicate titles across sources.

### Memory Table Not Updating

**Symptom:** `analysis_market_memory` not reflecting new source's news.

**Checklist:**
1. Check `analysis_filtered_news` — does it have entries from recent batch? If no → news processor issue.
2. Check curator lock: `sudo docker exec redis redis-cli GET memory:curator:lock`
3. Check gateway logs: `sudo docker logs gateway-2.0 --since 30m 2>&1 | grep -i curator`
4. Are filtered stories within curator's 3-hour lookback?

### Concurrency Between Sources

**Not an issue.** The pipeline is intentionally single-threaded (Redis lock). Sources don't need coordination — whichever fetch completes first triggers the pipeline, which reads ALL recent articles from ALL sources in one pass.

## File Reference

| File | Purpose |
|------|---------|
| `services/workers/data-fetcher-2.0/migrations/` | SQL migrations |
| `services/workers/data-fetcher-2.0/src/.../Workers/<Source>/` | .NET fetch worker |
| `services/workers/data-fetcher-2.0/src/.../Infrastructure/Common/GatewayAlertNotifier.cs` | Triggers pipeline via HTTP |
| `services/ai/gateway-2.0/src/core/analysis/news-processor.ts` | Unfiltered → Filtered (LLM) |
| `services/ai/gateway-2.0/src/core/analysis/memory-curator.ts` | Filtered → Market Memory (LLM) |
| `services/ai/gateway-2.0/src/http/recommendations.ts` | HTTP endpoints for manual triggers |
| `services/ai/gateway-2.0/src/config.ts` | `CURATOR_MODEL` env var |
| `services/mcp/tools/news.py` | MCP tools reading market memory |
| `scripts/freshness-check/src/table-config.ts` | Freshness monitoring config |
