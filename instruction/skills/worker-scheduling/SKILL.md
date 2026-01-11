---
name: worker-scheduling
description: Manage timezone-aware worker schedules via database. Use when updating worker run times, changing schedule timezone, enabling/disabling schedules, or troubleshooting worker scheduling issues.
---

# Worker Scheduling

Manage worker schedules by updating the `fetch_schedules` database table.

## Database Schema

**Table**: `fetch_schedules`

| Column | Type | Description |
|--------|------|-------------|
| `schedule_time` | `time` | Time of day (in `schedule_timezone`) |
| `schedule_timezone` | `varchar(50)` | IANA timezone (e.g., `America/New_York`) |
| `is_enabled` | `boolean` | Enable/disable schedule |
| `fetch_config` | `jsonb` | Job-specific configuration |

## Workflow: Change Schedule

### 1. Update Database

Run in Supabase SQL Editor. See [references/sql-examples.md](references/sql-examples.md) for full examples.

```sql
-- Update schedule time
UPDATE fetch_schedules 
SET schedule_time = '17:00:00',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'TwelveData Daily Stocks';
```

### 2. Apply Changes

Workers read schedule on each loop. To apply immediately, restart containers.

**From Windows (local):**
```powershell
.\scripts\apply-schedule-changes.ps1
```

**From VM (SSH):**
```bash
./scripts/apply-schedule-changes.sh
```

### 3. Verify

Scripts output new schedule automatically. Expected format:
```
Schedule 'TwelveData Daily Stocks' loaded. Next run at 17:00:00 America/New_York (22:00 UTC, in Xh Xm)
```

## Current Schedules

| Worker | Time | Timezone | Purpose |
|--------|------|----------|---------|
| TwelveData | 16:30 | America/New_York | 30 min after NYSE close |
| CandlestickAnalysis | 18:30 | America/New_York | 2 hours after TwelveData |

## Common Timezones

| Timezone ID | Description |
|-------------|-------------|
| `America/New_York` | US Eastern (EST/EDT) |
| `America/Chicago` | US Central |
| `America/Los_Angeles` | US Pacific |
| `UTC` | Coordinated Universal Time |

## How It Works

```
Worker Loop:
  1. Load schedule from DB (schedule_time, schedule_timezone)
  2. Convert to UTC using TimeZoneInfo (handles DST)
  3. Calculate delay and wait
  4. Execute job
  5. Loop back to step 1
```

- Server timezone doesn't matter (always converts to UTC)
- DST handled automatically
- Changes picked up after current job completes (or on restart)

## Troubleshooting

See [references/sql-examples.md](references/sql-examples.md) for diagnostic queries.

| Issue | Cause | Fix |
|-------|-------|-----|
| Schedule not updating | Worker sleeping | Restart container |
| "No enabled schedule found" | `is_enabled = false` | Check DB values |
| Wrong time conversion | Invalid timezone | Use valid IANA timezone |

## Bundled Resources

| Path | Purpose |
|------|---------|
| `scripts/apply-schedule-changes.ps1` | Restart & verify (Windows) |
| `scripts/apply-schedule-changes.sh` | Restart & verify (VM) |
| `references/sql-examples.md` | SQL queries for view/update/troubleshoot |
