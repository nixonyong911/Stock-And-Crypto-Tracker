---
name: maintaining-leaderboards
description: Use when creating, modifying, or extending scored leaderboard materialized views, adding new data sources to existing leaderboards, creating new leaderboards from different source tables, adjusting scoring weights, or troubleshooting leaderboard refresh failures
---

# Maintaining Leaderboards

## Overview

Leaderboards are **materialized views** that aggregate raw time-series data from multiple source tables into a single scored, ranked output. They answer "what are the top X right now?" using PERCENT_RANK normalization across weighted scoring dimensions.

The pattern: `source tables → CTEs (aggregate + normalize) → PERCENT_RANK scoring → total_score + rank → materialized view`.

## Architecture

```
Source Tables (INSERT per snapshot)     Lookup Table (identity)       Materialized View (derived)
┌─────────────────────────────┐        ┌──────────────────┐         ┌─────────────────────────┐
│ unfiltered_*_data_1         │───┐    │ lookup_*         │────┐    │ analysis_leaderboard_*  │
│ unfiltered_*_data_2         │───┼───>│ (symbol, name,   │    ├───>│ (raw metrics + scores   │
│ unfiltered_*_data_3         │───┘    │  type, id PK)    │    │    │  + total_score + rank)  │
└─────────────────────────────┘        └──────────────────┘    │    └─────────────────────────┘
                                                               │              ▲
Worker (scheduled) ────────────────────────────────────────────┘              │
  1. Fetch data from APIs                                                     │
  2. INSERT into source tables                                                │
  3. Flush lookup metadata                                                    │
  4. REFRESH MATERIALIZED VIEW CONCURRENTLY ──────────────────────────────────┘
  5. Prune old data
```

## Key Components

### 1. Source Tables (`unfiltered_*`)

Raw time-series data. INSERT per snapshot (not upsert). Each row has `fetched_at` timestamp.

**Existing example** (eToro):

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `unfiltered_etoro_social_instrument_data` | Crowd metrics per instrument | `holding_pct`, `buy_pct_change_24h`, `traders_*_change` |
| `unfiltered_etoro_top_investor_positions` | Top investor portfolio positions | `username`, `instrument_id`, `is_buy`, `total_investment_pct` |
| `unfiltered_etoro_curated_lists` | Editorial picks | `list_name`, `instrument_id` |

**File:** [018_add_etoro_social_data.sql](services/workers/data-fetcher-2.0/migrations/018_add_etoro_social_data.sql)

### 2. Lookup Table

Maps opaque IDs to human-readable identity. Populated by the instrument service during data collection.

**Current schema** (`lookup_etoro_instruments`):

```
instrument_id PK, display_name NOT NULL, symbol, instrument_type_id, first_seen_at, updated_at
```

**Files:** Migrations [018](services/workers/data-fetcher-2.0/migrations/018_add_etoro_social_data.sql) through [021](services/workers/data-fetcher-2.0/migrations/021_drop_internal_symbol.sql)

### 3. Instrument Service (Cache Layer)

[EtoroInstrumentService.cs](services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Workers/Etoro/EtoroInstrumentService.cs) -- singleton with persistent `ConcurrentDictionary` cache.

Lifecycle per worker run: `LoadAsync` → `TrackFromSearch` (Phase A) → `ResolveBatchAsync` (Phase E) → `FlushPendingAsync` (batch upsert to lookup table).

Any new data source that has instrument/ticker IDs needs a similar service to resolve IDs to names/symbols/types.

### 4. Materialized View (The Leaderboard)

**File:** [022_add_etoro_leaderboard.sql](services/workers/data-fetcher-2.0/migrations/022_add_etoro_leaderboard.sql)

The view is a chain of CTEs:

```
latest_fetch → prev_fetch → latest_social → prev_social → investors → curated
  → all_instruments (UNION of all source instrument_ids)
  → combined (LEFT JOIN all sources + lookup for identity)
  → scored (PERCENT_RANK per dimension)
  → final SELECT (total_score + RANK() + scored_at)
```

**Required indexes:**
- UNIQUE on the primary key (enables `REFRESH CONCURRENTLY`)
- DESC on `total_score` (fast top-N queries)
- On any column used for filtering (e.g., `instrument_type_id`)

### 5. Worker Refresh

In [EtoroSocialDataWorker.cs](services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Workers/Etoro/EtoroSocialDataWorker.cs), the `RefreshLeaderboardAsync` method runs after data insertion and lookup flush:

```csharp
await connection.ExecuteAsync(
    "REFRESH MATERIALIZED VIEW CONCURRENTLY analysis_leaderboard_etoro");
```

Wrapped in try-catch so refresh failure doesn't break data collection. Uses `CONCURRENTLY` so the view stays queryable during refresh.

### 6. Freshness Check

[table-config.ts](scripts/freshness-check/src/table-config.ts) monitors that the `scored_at` column is updated within the expected threshold.

```typescript
{
  table: "analysis_leaderboard_etoro",
  column: "scored_at",
  thresholdHours: 8,  // 4h interval + buffer
  skipRule: "never",
  label: "etoro_leaderboard",
}
```

## Scoring Pattern

### PERCENT_RANK Normalization

Each metric is normalized to 0-1 using `PERCENT_RANK() OVER (ORDER BY metric NULLS FIRST)`, then multiplied by the dimension's max points. This makes different scales (percentages, counts, dollar amounts) comparable.

### Current eToro Dimensions (0-100 total)

| Dimension | Points | Signals | Why |
|-----------|--------|---------|-----|
| Crowd Adoption | 25 | `holding_pct` | Broad market conviction |
| Buying Momentum | 25 | `buy_pct_change_24h` (10), `traders_7day_change` (8), `traders_30day_change` (7) | Accelerating demand |
| Smart Money | 25 | `investor_count` (12), `bullish_ratio` (8), `avg_net_profit` (5) | Informed conviction |
| Trend Acceleration | 15 | `holding_pct_delta` (10), `popularity_uniques_7day` (5) | Emerging opportunities |
| Curated Recognition | 10 | `curated_list_count * 5`, capped at 10 | Editorial endorsement |

### Adding/Adjusting Dimensions

To change weights, edit the `scored` CTE in the migration SQL. The pattern for each dimension:

```sql
ROUND((
    COALESCE(PERCENT_RANK() OVER (ORDER BY metric_a NULLS FIRST), 0) * weight_a
    + COALESCE(PERCENT_RANK() OVER (ORDER BY metric_b NULLS FIRST), 0) * weight_b
)::numeric, 2) AS dimension_score
```

After changing the SQL, drop and recreate the view:

```sql
DROP MATERIALIZED VIEW IF EXISTS analysis_leaderboard_etoro;
-- then CREATE MATERIALIZED VIEW ... with new SQL
-- then recreate indexes
```

## How To: Add a New Source Table to an Existing Leaderboard

Example: adding a new `unfiltered_etoro_sentiment_data` table to the eToro leaderboard.

### Step 1: Create the source table migration

```sql
CREATE TABLE unfiltered_etoro_sentiment_data (
    id SERIAL PRIMARY KEY,
    instrument_id INT NOT NULL,
    sentiment_score DECIMAL(5,2),
    mention_count INT,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_uf_etoro_sentiment_fetched ON unfiltered_etoro_sentiment_data(fetched_at DESC);
```

### Step 2: Add data collection to the worker

Add a new phase in `EtoroSocialDataWorker.CollectSocialDataAsync` that fetches and inserts sentiment data.

### Step 3: Add a CTE in the leaderboard view

```sql
sentiment AS (
    SELECT instrument_id, sentiment_score, mention_count
    FROM unfiltered_etoro_sentiment_data
    WHERE fetched_at = (SELECT MAX(fetched_at) FROM unfiltered_etoro_sentiment_data)
),
```

### Step 4: Include in `all_instruments` UNION

```sql
all_instruments AS (
    SELECT instrument_id FROM latest_social
    UNION SELECT instrument_id FROM investors
    UNION SELECT instrument_id FROM curated
    UNION SELECT instrument_id FROM sentiment  -- NEW
),
```

### Step 5: LEFT JOIN in `combined` CTE

```sql
LEFT JOIN sentiment sent ON sent.instrument_id = a.instrument_id
```

### Step 6: Add scoring dimension

Add a new PERCENT_RANK line in the `scored` CTE and include it in the total_score sum.

### Step 7: Drop + recreate the view, add freshness check for the new source table

## How To: Add a Different Data Source (Non-eToro)

Example: adding a Binance social leaderboard alongside the eToro one.

### What to create

| Component | eToro equivalent | New for Binance |
|-----------|-----------------|-----------------|
| Source tables | `unfiltered_etoro_*` | `unfiltered_binance_*` |
| Lookup table | `lookup_etoro_instruments` | `lookup_binance_instruments` (or reuse eToro's if same instruments) |
| Cache service | `EtoroInstrumentService.cs` | `BinanceInstrumentService.cs` |
| Worker | `EtoroSocialDataWorker.cs` | `BinanceSocialDataWorker.cs` |
| Leaderboard | `analysis_leaderboard_etoro` | `analysis_leaderboard_binance` |
| Freshness checks | etoro entries in table-config.ts | binance entries |

### Cross-source leaderboard

To combine eToro + Binance data into one leaderboard, create a view that JOINs both lookup tables on symbol (since instrument_ids differ across platforms):

```sql
CREATE MATERIALIZED VIEW analysis_leaderboard_combined AS
WITH etoro_data AS ( ... ),
     binance_data AS ( ... ),
     merged AS (
         SELECT COALESCE(e.symbol, b.symbol) AS symbol, ...
         FROM etoro_data e
         FULL OUTER JOIN binance_data b ON e.symbol = b.symbol
     ),
     scored AS ( ... )
SELECT * FROM scored ORDER BY total_score DESC;
```

## How To: Create a New Leaderboard (Different Angle)

Leaderboards can rank the same instruments by different criteria. Examples:

| Leaderboard | What it answers | Source tables |
|-------------|----------------|--------------|
| `analysis_leaderboard_etoro` | "What's trending on eToro?" | eToro social + investors + curated |
| `analysis_leaderboard_insider` | "Where is insider money flowing?" | `discovery_insider_trading` + `discovery_institutional_holdings` |
| `analysis_leaderboard_technical` | "What has the strongest technicals?" | `analysis_indicators_stock_*` + `analysis_stock_candlestick_pattern` |
| `analysis_leaderboard_combined` | "What scores highest across ALL signals?" | All of the above |

### Template for a new leaderboard migration

```sql
CREATE MATERIALIZED VIEW analysis_leaderboard_<name> AS
WITH
-- 1. Get latest snapshot from each source table
source_a AS (
    SELECT ... FROM table_a WHERE fetched_at = (SELECT MAX(fetched_at) FROM table_a)
),
source_b AS (
    SELECT ... FROM table_b WHERE fetched_at = (SELECT MAX(fetched_at) FROM table_b)
),
-- 2. Combine all entity IDs
all_entities AS (
    SELECT entity_id FROM source_a
    UNION SELECT entity_id FROM source_b
),
-- 3. Join sources + lookup for identity
combined AS (
    SELECT a.entity_id, l.symbol, l.display_name,
           s_a.metric_1, s_b.metric_2, ...
    FROM all_entities a
    JOIN lookup_table l ON l.id = a.entity_id
    LEFT JOIN source_a s_a ON s_a.entity_id = a.entity_id
    LEFT JOIN source_b s_b ON s_b.entity_id = a.entity_id
),
-- 4. Score using PERCENT_RANK
scored AS (
    SELECT *,
        ROUND((PERCENT_RANK() OVER (ORDER BY metric_1 NULLS FIRST) * weight_1)::numeric, 2) AS score_a,
        ROUND((PERCENT_RANK() OVER (ORDER BY metric_2 NULLS FIRST) * weight_2)::numeric, 2) AS score_b
    FROM combined
)
-- 5. Final output with total + rank
SELECT *,
    ROUND((score_a + score_b)::numeric, 2) AS total_score,
    RANK() OVER (ORDER BY (score_a + score_b) DESC) AS rank,
    NOW() AS scored_at
FROM scored
ORDER BY total_score DESC;

-- 6. Required indexes
CREATE UNIQUE INDEX idx_leaderboard_<name>_pk ON analysis_leaderboard_<name> (entity_id);
CREATE INDEX idx_leaderboard_<name>_score ON analysis_leaderboard_<name> (total_score DESC);
```

### Checklist for each new leaderboard

1. **Migration SQL** — `services/workers/data-fetcher-2.0/migrations/<NNN>_add_<name>_leaderboard.sql`
2. **Worker refresh call** — add `REFRESH MATERIALIZED VIEW CONCURRENTLY analysis_leaderboard_<name>` after the relevant worker's data insertion
3. **Freshness check** — add entry to [table-config.ts](scripts/freshness-check/src/table-config.ts) with `scored_at` column
4. **Apply migration** on VM — `psql` then verify with `SELECT COUNT(*) FROM analysis_leaderboard_<name>`

## Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Source tables | `unfiltered_<source>_<data_type>` | `unfiltered_etoro_social_instrument_data` |
| Lookup tables | `lookup_<source>_instruments` | `lookup_etoro_instruments` |
| Leaderboard views | `analysis_leaderboard_<source or angle>` | `analysis_leaderboard_etoro` |
| Leaderboard indexes | `idx_leaderboard_<source>_<column>` | `idx_leaderboard_etoro_score` |
| Freshness labels | `<source>_leaderboard` | `etoro_leaderboard` |

## File Locations

| Component | Path |
|-----------|------|
| Migrations | `services/workers/data-fetcher-2.0/migrations/` |
| Worker code | `services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Workers/Etoro/` |
| Instrument service | `services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Workers/Etoro/EtoroInstrumentService.cs` |
| Models | `services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Domain/Providers/Etoro/Models/EtoroModels.cs` |
| Client | `services/workers/data-fetcher-2.0/src/DataFetcher.Worker/Infrastructure/Providers/Etoro/EtoroMarketDataClient.cs` |
| Tests | `services/workers/data-fetcher-2.0/tests/DataFetcher.Worker.Tests/` |
| Freshness check | `scripts/freshness-check/src/table-config.ts` |
| Docker compose | `deployment/vm/docker-compose.yml` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing UNIQUE index on materialized view | `REFRESH CONCURRENTLY` requires it -- always create one |
| Forgetting `NULLS FIRST` in PERCENT_RANK | Instruments with NULL metrics get rank 0 instead of being excluded |
| Not wrapping refresh in try-catch | Refresh failure breaks the entire data collection cycle |
| Using `REFRESH` without `CONCURRENTLY` | View becomes unqueryable during refresh -- causes downtime |
| Forgetting freshness check entry | No alerting when the leaderboard stops refreshing |
| Hardcoding snapshot timestamps | Always use `SELECT MAX(fetched_at) FROM ...` subquery to get latest |
| Using `CREATE MATERIALIZED VIEW IF NOT EXISTS` inside `BEGIN/COMMIT` | Silently rolls back on some PostgreSQL versions -- apply without transaction wrapper |

## Existing Leaderboard Reference

**`analysis_leaderboard_etoro`** — [migration 022](services/workers/data-fetcher-2.0/migrations/022_add_etoro_leaderboard.sql)
- Sources: 3 unfiltered eToro tables + lookup
- 5 scoring dimensions, 0-100 scale
- Refreshed by `EtoroSocialDataWorker` every 4h
- ~1,200 instruments ranked

**`discovery_signals_scored`** — [migration 016](services/workers/data-fetcher-2.0/migrations/016_add_discovery_tables.sql)
- Sources: `discovery_insider_trading` + `discovery_institutional_holdings`
- Simpler scoring: raw multipliers (not PERCENT_RANK)
- Not auto-refreshed (manual `REFRESH`)
