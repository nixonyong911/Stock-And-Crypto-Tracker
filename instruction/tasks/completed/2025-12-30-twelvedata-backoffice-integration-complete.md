# TwelveData + Back-Office Integration Session

**Date**: December 30, 2025  
**Status**: ✅ Completed

---

## Overview

This session addressed multiple issues with the TwelveData data fetcher and implemented a comprehensive back-office UI for managing data-fetcher workers.

---

## Issues Identified & Fixed

### 1. TwelveData Worker Not Fetching Data

**Symptoms:**
- TwelveData API statistics showed sporadic/no API calls
- Worker appeared to be running but not fetching on schedule

**Root Causes Found:**

#### 1.1 Type Mismatch Bug
- **Error**: `System.InvalidCastException: Unable to cast object of type 'System.TimeSpan' to type 'System.TimeOnly'`
- **Location**: `StockFetchWorker.cs` and `FetchSchedule.cs`
- **Cause**: PostgreSQL `TIME` column returns `TimeSpan` via Dapper, but C# model used `TimeOnly`
- **Fix**: Changed `FetchSchedule.ScheduleTimeUtc` from `TimeOnly` to `TimeSpan`

```csharp
// Before
public TimeOnly ScheduleTimeUtc { get; set; }

// After
public TimeSpan ScheduleTimeUtc { get; set; }
```

#### 1.2 Missing Batch Fetch Endpoint
- **Issue**: Cron script called `/api/fetch/trigger/all` which didn't exist
- **Fix**: Added new endpoint in `FetchController.cs`:

```csharp
[HttpPost("trigger/all")]
public async Task<ActionResult<BatchFetchResponse>> TriggerFetchAll([FromQuery] string? date = null)
```

#### 1.3 Cron Job Not Installed
- **Issue**: The crontab entry in `run-twelvedata.sh` was commented out (not installed on VM)
- **Status**: Documented for manual installation when needed

### 2. "No Data Available" API Response

**Symptoms:**
- API returned 0 records even for valid dates
- Error code 400 from TwelveData API

**Root Cause:**
- Testing on weekend dates (Saturday/Sunday) when stock market is closed
- TwelveData returns "No data available" for non-trading days

**Fix:**
- Added debug logging to `TwelveDataApiClient.GetTimeSeriesAsync()` to capture full request URL and response
- Manual test with weekday date (`2025-12-26`) succeeded with 26 records

---

## Back-Office UI Implementation

### New Features Added

#### 1. Sidebar Navigation
- **File**: `services/back-office/src/components/sidebar.tsx`
- Collapsible sections for CLI Testing and Data Fetchers
- Dynamic worker list fetched from `worker_registry` table
- Active state indicators for workers
- Direct link to Grafana dashboard

#### 2. Data Fetchers List Page
- **File**: `services/back-office/src/app/data-fetchers/page.tsx`
- Grid display of all registered data-fetcher workers
- Status indicators and quick actions

#### 3. Individual Worker Config Page
- **File**: `services/back-office/src/app/data-fetchers/[worker]/page.tsx`
- Worker status and health display
- Schedule configuration (enable/disable, time)
- Ticker management (view, toggle active, trigger fetch)
- Grafana panel embeds for monitoring
- Manual batch fetch trigger

#### 4. 404 Handler
- **File**: `services/back-office/src/app/not-found.tsx`
- Required for Next.js App Router build

### Database Schema Added

#### `worker_registry` Table
```sql
CREATE TABLE worker_registry (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    service_type VARCHAR(50) NOT NULL DEFAULT 'data-fetcher',
    health_endpoint VARCHAR(500),
    status_endpoint VARCHAR(500),
    config_schema JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_health_check TIMESTAMPTZ,
    last_health_status VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `worker_metrics_daily` Table
```sql
CREATE TABLE worker_metrics_daily (
    id SERIAL PRIMARY KEY,
    worker_id INTEGER NOT NULL REFERENCES worker_registry(id),
    metric_date DATE NOT NULL,
    api_calls_total INTEGER NOT NULL DEFAULT 0,
    api_calls_success INTEGER NOT NULL DEFAULT 0,
    api_calls_failed INTEGER NOT NULL DEFAULT 0,
    records_inserted INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms DECIMAL(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(worker_id, metric_date)
);
```

---

## Secrets Management Issues

### Problem 1: Hardcoded Secrets in Dockerfile (WRONG)

**Initial Mistake:**
```dockerfile
# BAD - Never do this!
ARG NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJ...
```

**Correct Approach:**
```dockerfile
# Dockerfile - declare without defaults
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
```

```yaml
# docker-compose.yml - pass from Infisical at build time
back-office:
  build:
    context: ./repo/services/back-office
    dockerfile: Dockerfile
    args:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY}
```

**Why Build Args for Next.js:**
- `NEXT_PUBLIC_*` variables are **inlined into the JavaScript bundle at build time**
- They cannot be passed at runtime like regular server env vars
- Must be available during `next build`

### Problem 2: Truncated Publishable Key

**Symptoms:**
- Back-office sidebar showed "No workers found"
- Supabase queries returning nothing

**Root Cause:**
- Key in Infisical was truncated (partial key stored)
- Full key needed: `sb_publishable_***REDACTED***` (see Infisical `DATABASE_ANON_KEY`)

**Resolution:**
- Updated Infisical with full publishable key
- Rebuilt and redeployed back-office container

### Problem 3: Double basePath Prefix

**Symptoms:**
- CLI page URL was `/back-office/back-office/cli` (double prefix)
- Pages not loading correctly

**Root Cause:**
- Sidebar component manually added `/back-office` prefix
- Next.js `basePath` config already handles this automatically

**Fix:**
```typescript
// Before
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/back-office";

// After - let Next.js handle it
const basePath = "";
```

---

## Supabase Publishable Keys Research

### Key Findings

**New API Key Format (Recommended):**
- `sb_publishable_xxx` - replaces legacy `anon` key
- Secret key - replaces legacy `service_role` key

**Timeline:**
- **October 1, 2025**: Auto-migration to new JWT signing keys
- **November 1, 2025**: Reminders sent; restored projects won't include legacy keys

**Compatibility:**
- `@supabase/supabase-js` supports BOTH legacy anon keys AND new publishable keys
- No code changes needed when switching key formats

---

## Files Modified

### Backend (.NET)
- `services/data-fetchers/TwelveData/src/TwelveData.Worker/Models/FetchSchedule.cs`
- `services/data-fetchers/TwelveData/src/TwelveData.Worker/Workers/StockFetchWorker.cs`
- `services/data-fetchers/TwelveData/src/TwelveData.Worker/Controllers/FetchController.cs`
- `services/data-fetchers/TwelveData/src/TwelveData.Worker/Services/TwelveDataApiClient.cs`
- `services/data-fetchers/TwelveData/src/TwelveData.Worker/Services/StockFetchService.cs`

### Frontend (Next.js)
- `services/back-office/src/components/sidebar.tsx` (new)
- `services/back-office/src/app/layout.tsx`
- `services/back-office/src/app/page.tsx`
- `services/back-office/src/app/cli/page.tsx`
- `services/back-office/src/app/data-fetchers/page.tsx` (new)
- `services/back-office/src/app/data-fetchers/[worker]/page.tsx` (new)
- `services/back-office/src/app/not-found.tsx` (new)
- `services/back-office/src/lib/supabase.ts`
- `services/back-office/Dockerfile`

### Infrastructure
- `deployment/vm/docker-compose.yml`

### Documentation
- `instruction/architecture/data-fetcher-backoffice-integration.md` (new)
- `instruction/runbooks/data-fetcher-requirements.md` (new)
- `instruction/runbooks/README.md` (new)

---

## Verification

### Database
- `worker_registry` table has TwelveData entry ✅
- `worker_metrics_daily` table created ✅
- RLS policies in place ✅

### Back-Office UI
- Sidebar shows "TwelveData Stock Fetcher" ✅
- Worker config page loads ✅
- Ticker list displays ✅
- Manual fetch trigger works ✅

### API Endpoints
- `/api/twelvedata/api/fetch/trigger/all` - batch fetch ✅
- `/api/twelvedata/api/fetch/trigger/{symbol}` - single fetch ✅
- `/api/twelvedata/api/fetch/status` - status check ✅

---

## Lessons Learned

1. **PostgreSQL TIME → C# mapping**: Use `TimeSpan`, not `TimeOnly` with Dapper
2. **Next.js `NEXT_PUBLIC_*` vars**: Must be available at build time, not runtime
3. **Next.js `basePath`**: Don't manually prefix links when `basePath` is configured
4. **Supabase publishable keys**: Full key format is `sb_publishable_xxx-yyy`, not just `sb_publishable_xxx`
5. **Stock market data**: No data available on weekends/holidays - test with trading day dates
6. **Secrets in Docker**: Never hardcode in Dockerfile; pass via build args from secret manager

---

## Related Documentation

- [Data Fetcher + Back-Office Integration](../architecture/data-fetcher-backoffice-integration.md)
- [Data Fetcher Requirements Runbook](../runbooks/data-fetcher-requirements.md)
- [Infisical Secrets Management](../architecture/infisical-secrets-management.md)
- [TwelveData Architecture](../architecture/twelvedata-architecture.md)


