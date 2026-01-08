# Worker Scheduling Skill

**Category**: Operations / Worker Management  
**Last Updated**: 2026-01-09  
**Purpose**: Guide for managing timezone-aware worker schedules via database

---

## Overview

Workers (TwelveData, CandlestickAnalysis) use **timezone-aware scheduling** stored in the `fetch_schedules` database table. Schedules can be modified via SQL without code changes.

---

## Database Schema

**Table**: `fetch_schedules`

| Column | Type | Description |
|--------|------|-------------|
| `schedule_time` | `time` | Time of day to run (in `schedule_timezone`) |
| `schedule_timezone` | `varchar(50)` | IANA timezone (e.g., `America/New_York`) |
| `is_enabled` | `boolean` | Enable/disable the schedule |
| `fetch_config` | `jsonb` | Job-specific configuration |

---

## Current Schedules

| Worker | Schedule Name | Time | Timezone | Purpose |
|--------|--------------|------|----------|---------|
| TwelveData | TwelveData Daily Stocks | 16:30 | America/New_York | 30 min after NYSE close |
| CandlestickAnalysis | Daily Candlestick Analysis | 18:30 | America/New_York | 2 hours after TwelveData |

---

## How to Change Schedule

### Step 1: Update Database

```sql
-- View current schedules
SELECT name, schedule_time, schedule_timezone, is_enabled 
FROM fetch_schedules;

-- Update TwelveData schedule (example: change to 5:00 PM ET)
UPDATE fetch_schedules 
SET schedule_time = '17:00:00',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'TwelveData Daily Stocks';

-- Update CandlestickAnalysis schedule (example: change to 7:00 PM ET)
UPDATE fetch_schedules 
SET schedule_time = '19:00:00',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Daily Candlestick Analysis';

-- Change timezone (example: use UTC instead)
UPDATE fetch_schedules 
SET schedule_timezone = 'UTC',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'TwelveData Daily Stocks';

-- Disable a schedule
UPDATE fetch_schedules 
SET is_enabled = false,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Daily Candlestick Analysis';
```

### Step 2: Apply Changes

**Workers only read the schedule when they loop back after completing a job.**

To apply immediately, restart the containers:

```bash
# SSH to VM
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1

# Restart specific worker
docker restart twelvedata
docker restart candlestick-analysis

# Or restart both
cd /opt/stocktracker && docker compose restart twelvedata candlestick-analysis
```

### Step 3: Verify New Schedule

```bash
# Check TwelveData
docker logs twelvedata 2>&1 | grep "Schedule.*loaded" | tail -1

# Check CandlestickAnalysis  
docker logs candlestick-analysis 2>&1 | grep "Schedule.*loaded" | tail -1
```

Expected output format:
```
Schedule 'TwelveData Daily Stocks' loaded. Next run at 17:00:00 America/New_York (22:00 UTC, in Xh Xm)
```

---

## Common Timezones

| Timezone ID | Description |
|-------------|-------------|
| `America/New_York` | US Eastern (handles EST/EDT automatically) |
| `America/Chicago` | US Central |
| `America/Los_Angeles` | US Pacific |
| `Europe/London` | UK (handles GMT/BST) |
| `Asia/Singapore` | Singapore |
| `UTC` | Coordinated Universal Time |

---

## How Scheduling Works Internally

```
┌─────────────────────────────────────────────────────────────┐
│  Worker Loop                                                 │
├─────────────────────────────────────────────────────────────┤
│  1. Load schedule from DB (schedule_time, schedule_timezone) │
│  2. Convert schedule_time from timezone to UTC               │
│  3. Calculate delay = scheduledUtc - now                     │
│  4. await Task.Delay(delay)  ← Worker sleeps here            │
│  5. Execute job                                              │
│  6. Loop back to step 1                                      │
└─────────────────────────────────────────────────────────────┘
```

**Key points:**
- DST handled automatically by `TimeZoneInfo`
- Server timezone doesn't matter (always converts to UTC)
- DB changes picked up after current job completes (or on restart)

---

## Troubleshooting

### Schedule not updating after DB change
**Cause**: Worker is sleeping, waiting for current scheduled time  
**Fix**: Restart the container

### Wrong timezone conversion
**Cause**: Invalid timezone ID  
**Fix**: Use valid IANA timezone from list above

### Worker shows "No enabled schedule found"
**Cause**: `is_enabled = false` or data_source not active  
**Fix**: 
```sql
SELECT fs.*, ds.name as data_source, ds.is_active 
FROM fetch_schedules fs 
JOIN data_sources ds ON fs.data_source_id = ds.id;
```

---

## Quick Reference Script

Run this after changing schedule in database:

```bash
# From local machine (PowerShell)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "
  echo '=== Restarting workers ===' &&
  cd /opt/stocktracker &&
  docker compose restart twelvedata candlestick-analysis &&
  sleep 15 &&
  echo '' &&
  echo '=== TwelveData Schedule ===' &&
  docker logs twelvedata 2>&1 | grep 'Schedule.*loaded' | tail -1 &&
  echo '' &&
  echo '=== CandlestickAnalysis Schedule ===' &&
  docker logs candlestick-analysis 2>&1 | grep 'Schedule.*loaded' | tail -1
"
```

---

## Related Files

- **TwelveData Worker**: `services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/Workers/StockFetchWorker.cs`
- **CandlestickAnalysis Worker**: `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Workers/CandlestickAnalysisWorker.cs`
- **Database Migration**: `add_schedule_timezone_column` (applied 2026-01-09)
