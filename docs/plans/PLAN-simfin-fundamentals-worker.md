# Plan: SimFin Fundamentals Worker Implementation

**Status:** Ready for Implementation
**Created:** 2026-02-02
**Priority:** High

---

## Executive Summary

Replace the non-functional YahooFinance worker with SimFin API integration for fetching stock fundamental data. The existing YahooFinance worker failed due to Yahoo blocking API access. SimFin provides a free, reliable API with pre-calculated financial ratios.

---

## Prerequisites - USER ACTION REQUIRED

### 1. SimFin API Key Registration

**Steps to get your FREE SimFin API key:**

1. Go to: https://app.simfin.com/login
2. Click "Register" to create a free account
3. Verify your email
4. After login, go to: https://app.simfin.com/data/access/api
5. Copy your API key from the dashboard

**Free tier includes:**
- 5,000 US stocks
- 5 years of historical data
- Web API access
- Bulk CSV download

### 2. Store API Key in Infisical

**Secret name:** `SIMFIN_API_KEY`
**Environment:** `prod` (and `dev` if needed)

```bash
# Via Infisical CLI (if you have it)
infisical secrets set SIMFIN_API_KEY=your_api_key_here --env=prod
```

Or add via Infisical web UI.

---

## Part 1: Database Schema Changes

### Current Table Structure (`analysis_stock_fundamentals`)

| Column | Type | Used by SimFin? | Action |
|--------|------|-----------------|--------|
| id | integer | ✅ Keep | - |
| stock_ticker_id | integer | ✅ Keep | - |
| market_cap | numeric | ✅ Yes | Keep |
| pe_ratio | numeric | ✅ Yes | Keep |
| forward_pe | numeric | ❌ No | **DROP** |
| peg_ratio | numeric | ❌ No | **DROP** |
| price_to_book | numeric | ✅ Yes | Keep |
| price_to_sales | numeric | ✅ Yes | Keep |
| enterprise_value | numeric | ✅ Yes | Keep |
| eps_ttm | numeric | ✅ Yes | Keep |
| revenue_ttm | numeric | ✅ Yes | Keep |
| gross_margin | numeric | ✅ Yes | Keep |
| operating_margin | numeric | ✅ Yes | Keep |
| profit_margin | numeric | ✅ Yes | Keep |
| debt_to_equity | numeric | ✅ Yes | Keep |
| current_ratio | numeric | ✅ Yes | Keep |
| fifty_two_week_high | numeric | ❌ No (price data) | **DROP** |
| fifty_two_week_low | numeric | ❌ No (price data) | **DROP** |
| fifty_day_average | numeric | ❌ No (price data) | **DROP** |
| two_hundred_day_average | numeric | ❌ No (price data) | **DROP** |
| beta | numeric | ❌ No | **DROP** |
| dividend_yield | numeric | ✅ Yes | Keep |
| dividend_rate | numeric | ❌ No | **DROP** |
| ex_dividend_date | date | ❌ No | **DROP** |
| payout_ratio | numeric | ✅ Yes | Keep |
| target_mean_price | numeric | ❌ No (analyst) | **DROP** |
| target_high_price | numeric | ❌ No (analyst) | **DROP** |
| target_low_price | numeric | ❌ No (analyst) | **DROP** |
| recommendation_mean | numeric | ❌ No (analyst) | **DROP** |
| number_of_analysts | integer | ❌ No (analyst) | **DROP** |
| last_fetched_at | timestamptz | ✅ Keep | - |
| created_at | timestamptz | ✅ Keep | - |
| updated_at | timestamptz | ✅ Keep | - |

### New Columns to ADD (SimFin provides these)

| Column | Type | Description |
|--------|------|-------------|
| return_on_equity | DECIMAL(10,4) | ROE % |
| return_on_assets | DECIMAL(10,4) | ROA % |
| book_value_per_share | DECIMAL(18,4) | BVPS |
| free_cash_flow | DECIMAL(18,2) | FCF |
| total_assets | DECIMAL(18,2) | Total Assets |
| total_liabilities | DECIMAL(18,2) | Total Liabilities |
| total_equity | DECIMAL(18,2) | Shareholders Equity |
| shares_outstanding | BIGINT | Shares Outstanding |
| fiscal_year | INTEGER | Latest fiscal year |
| fiscal_period | VARCHAR(10) | Q1/Q2/Q3/Q4/FY |
| report_date | DATE | Date of latest report |
| data_source | VARCHAR(50) | 'simfin' (for tracking) |

### Recommendation: DROP and RECREATE

**Why DROP is better than ALTER:**
1. Table has only 1 row (MSFT test data)
2. Dropping 14 columns + adding 12 columns via ALTER is messy
3. Clean slate ensures no orphaned constraints/indexes
4. Faster to implement

### Migration SQL (to be run via Supabase MCP)

```sql
-- Step 1: Drop existing table
DROP TABLE IF EXISTS analysis_stock_fundamentals CASCADE;

-- Step 2: Create new optimized table
CREATE TABLE analysis_stock_fundamentals (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_ticker_id INT NOT NULL UNIQUE REFERENCES stock_tickers(id) ON DELETE CASCADE,

    -- Valuation Metrics
    market_cap DECIMAL(18,2),
    pe_ratio DECIMAL(10,4),
    price_to_book DECIMAL(10,4),
    price_to_sales DECIMAL(10,4),
    enterprise_value DECIMAL(18,2),

    -- Per Share Data
    eps_ttm DECIMAL(10,4),
    book_value_per_share DECIMAL(18,4),

    -- Revenue & Profitability
    revenue_ttm DECIMAL(18,2),
    gross_margin DECIMAL(10,4),
    operating_margin DECIMAL(10,4),
    profit_margin DECIMAL(10,4),

    -- Returns
    return_on_equity DECIMAL(10,4),
    return_on_assets DECIMAL(10,4),

    -- Financial Health
    debt_to_equity DECIMAL(10,4),
    current_ratio DECIMAL(10,4),

    -- Dividends
    dividend_yield DECIMAL(10,4),
    payout_ratio DECIMAL(10,4),

    -- Balance Sheet Summary
    total_assets DECIMAL(18,2),
    total_liabilities DECIMAL(18,2),
    total_equity DECIMAL(18,2),
    free_cash_flow DECIMAL(18,2),
    shares_outstanding BIGINT,

    -- Report Metadata
    fiscal_year INT,
    fiscal_period VARCHAR(10),
    report_date DATE,
    data_source VARCHAR(50) DEFAULT 'simfin',

    -- Timestamps
    last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX ix_analysis_stock_fundamentals_ticker ON analysis_stock_fundamentals(stock_ticker_id);
CREATE INDEX ix_analysis_stock_fundamentals_fetched ON analysis_stock_fundamentals(last_fetched_at);

-- RLS
ALTER TABLE analysis_stock_fundamentals ENABLE ROW LEVEL SECURITY;

-- Comment
COMMENT ON TABLE analysis_stock_fundamentals IS 'Company fundamental data from SimFin API - one row per ticker with latest data';
```

### Earnings Calendar Table - Keep As-Is

The `analysis_earnings_calendar` table structure is fine. SimFin does NOT provide earnings calendar data, so this table will remain unused for now (can be populated by a different source later if needed).

---

## Part 2: Worker Implementation

### 2.1 Language Decision

**Keep C# Worker** (existing infrastructure):
- Reuse existing project structure at `/services/workers/data-fetcher/YahooFinance/`
- Rename to `SimFin.Worker` or repurpose existing code
- Docker/CI/CD already configured

### 2.2 SimFin API Endpoints to Use

**Per-Ticker API (Recommended for 100 tickers):**

```
GET https://backend.simfin.com/api/v3/companies/statements/compact
?ticker=AAPL
&statements=pl,bs,cf,derived
&period=ttm
&fyear=0
```

Headers:
```
Authorization: api-key {SIMFIN_API_KEY}
```

**Response includes:**
- Income Statement (pl): Revenue, Net Income, EPS
- Balance Sheet (bs): Assets, Liabilities, Equity
- Cash Flow (cf): Free Cash Flow
- Derived (derived): Ratios like PE, PB, ROE, margins

### 2.3 Fetch Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SimFin Daily Fetch Workflow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  06:00 UTC - Scheduled job starts                               │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Query stock_tickers table                            │   │
│  │     SELECT id, symbol FROM stock_tickers                 │   │
│  │     WHERE is_active = true                               │   │
│  │     → Returns 10/100 tickers dynamically                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  2. For each ticker:                                     │   │
│  │     a. Call SimFin API (per-ticker endpoint)             │   │
│  │     b. Parse JSON response                               │   │
│  │     c. Map to FundamentalsData model                     │   │
│  │     d. Upsert to analysis_stock_fundamentals             │   │
│  │     e. Add 200ms delay between requests (rate limiting)  │   │
│  │     f. Log success/failure                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  3. Update worker_fetch_schedules                        │   │
│  │     - last_run_at = NOW()                                │   │
│  │     - last_run_status = 'success'/'partial'/'failed'     │   │
│  │     - last_run_message = summary                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  Done! No files to delete (JSON API, no CSV download)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Key Implementation Details

#### Dynamic Ticker Loading
```csharp
// Always fetch fresh from database - automatically picks up new tickers
public async Task<IEnumerable<StockTicker>> GetActiveTickersAsync()
{
    const string sql = @"
        SELECT id, symbol, name
        FROM stock_tickers
        WHERE is_active = true
        ORDER BY symbol";
    return await connection.QueryAsync<StockTicker>(sql);
}
```

#### Only Insert MY Tickers
- The workflow queries `stock_tickers` table first
- Only those tickers are sent to SimFin API
- No risk of inserting unwanted tickers
- If SimFin doesn't have a ticker, log warning and skip

#### No CSV Files = No Cleanup Needed
- Using per-ticker JSON API (not bulk CSV download)
- No files stored locally
- No cleanup required
- Memory-only processing

#### Rate Limiting
- SimFin free tier: reasonable rate limits
- Add 200-500ms delay between requests
- 100 tickers × 500ms = ~50 seconds total
- Use Polly for retry on transient failures

---

## Part 3: Files to Modify/Create

### 3.1 Database Migration
- [ ] Run DROP/CREATE SQL via Supabase MCP `apply_migration`

### 3.2 Entity Framework (StockTracker.Data)
- [ ] Update `AnalysisStockFundamentals.cs` entity
- [ ] Update `AnalysisStockFundamentalsConfiguration.cs`
- [ ] Remove `AnalysisEarningsCalendar` references (optional, can keep)

### 3.3 Worker Service (Rename/Repurpose YahooFinance.Worker)
- [ ] Rename folder from `YahooFinance` to `SimFin` (or keep and refactor)
- [ ] Update `appsettings.json`:
  - Add `SimFin:ApiKey` config (from env var `SIMFIN_API_KEY`)
  - Add `SimFin:BaseUrl` = `https://backend.simfin.com/api/v3`
  - Add `SimFin:DelayBetweenRequestsMs` = `500`
- [ ] Replace `YahooFinanceClient.cs` with `SimFinClient.cs`:
  - HTTP client with API key header
  - Per-ticker data fetch method
  - JSON response parsing
- [ ] Update `FundamentalsRepository.cs`:
  - Upsert SQL for new schema
- [ ] Update `FundamentalsFetchService.cs`:
  - Use new client
  - Map SimFin response to DB model
- [ ] Update `Program.cs`:
  - Register new services
  - Update config binding

### 3.4 Docker/Deployment
- [ ] Update `docker-compose.yml`:
  - Add `SIMFIN_API_KEY` environment variable
- [ ] Update Infisical to inject `SIMFIN_API_KEY`

### 3.5 Worker Registry (Database)
- [ ] Update `worker_registry` row:
  - Change name from 'yahoofinance' to 'simfin' (or keep)
  - Update description
- [ ] Update `lookup_data_sources`:
  - Add 'SimFin' data source (or update YahooFinance entry)

---

## Part 4: Verification Checklist

### After Implementation:
1. [ ] Manual trigger single ticker: `/api/fetch/trigger/AAPL`
2. [ ] Verify data in `analysis_stock_fundamentals` via Supabase
3. [ ] Run again - verify UPSERT (updated_at changes, no duplicates)
4. [ ] Add a new ticker to `stock_tickers` table
5. [ ] Trigger fetch - verify new ticker is automatically included
6. [ ] Check scheduled trigger works (modify schedule temporarily)
7. [ ] Revert schedule to 06:00 UTC

---

## Part 5: Concerns Addressed

| Concern | Solution |
|---------|----------|
| CSV file storage | ❌ Not using CSV - per-ticker JSON API |
| Deleting CSV after extraction | N/A - no files created |
| Only insert my tickers | ✅ Query `stock_tickers` first, only fetch those |
| Unused 4,990 tickers | ❌ Never fetched - we only call API for our tickers |
| Symbol mismatch | SimFin uses standard US symbols (AAPL, MSFT). Log warnings for missing |
| Dynamic new tickers | ✅ Always queries `stock_tickers` at runtime |
| NULL columns wasting space | ✅ New schema only has columns SimFin provides |

---

## Part 6: Environment Variables

| Variable | Description | Where to Set |
|----------|-------------|--------------|
| `SIMFIN_API_KEY` | SimFin API key | Infisical (secret) |
| `DATABASE_URL` | PostgreSQL connection | Infisical (existing) |

---

## Part 7: Estimated Timeline

| Task | Estimate |
|------|----------|
| User: Get SimFin API key | 5 min |
| User: Add to Infisical | 5 min |
| DB Migration (DROP/CREATE) | 10 min |
| Update EF Core entities | 15 min |
| Implement SimFinClient | 30 min |
| Update Repository | 15 min |
| Update FetchService | 20 min |
| Update configs & DI | 10 min |
| Testing & verification | 20 min |
| **Total** | ~2 hours |

---

## Appendix: SimFin API Response Example

```json
{
  "columns": ["Ticker", "Fiscal Year", "Revenue", "Net Income", "EPS", ...],
  "data": [
    ["AAPL", 2025, 394328000000, 97000000000, 6.13, ...]
  ]
}
```

The response is tabular - columns array + data array. Parse by mapping column index to field name.

---

## Ready to Execute

**Before starting, confirm:**
1. ✅ SimFin API key obtained and added to Infisical as `SIMFIN_API_KEY`
2. ✅ This plan has been reviewed

Then proceed with implementation.
