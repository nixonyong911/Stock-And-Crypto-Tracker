# SQL Examples for Worker Scheduling

## View Current Schedules

```sql
SELECT 
    fs.name AS schedule_name,
    fs.worker_id,
    fs.schedule_time,
    fs.schedule_timezone,
    fs.is_enabled,
    fs.last_run_at,
    fs.last_run_status,
    fs.last_run_message,
    ds.name AS data_source,
    wr.name AS worker_name
FROM worker_fetch_schedules fs
JOIN data_sources ds ON fs.data_source_id = ds.id
LEFT JOIN worker_registry wr ON fs.worker_id = wr.id
ORDER BY fs.name;
```

## Update Schedule Time

```sql
-- TwelveData: Change to 5:00 PM ET
UPDATE worker_fetch_schedules 
SET schedule_time = '17:00:00',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'TwelveData Daily Stocks';

-- CandlestickAnalysis: Change to 7:00 PM ET
UPDATE worker_fetch_schedules 
SET schedule_time = '19:00:00',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Daily Candlestick Analysis';
```

## Change Timezone

```sql
-- Use UTC instead of ET
UPDATE worker_fetch_schedules 
SET schedule_timezone = 'UTC',
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'TwelveData Daily Stocks';
```

## Enable/Disable Schedule

```sql
-- Disable
UPDATE worker_fetch_schedules 
SET is_enabled = false,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Daily Candlestick Analysis';

-- Enable
UPDATE worker_fetch_schedules 
SET is_enabled = true,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Daily Candlestick Analysis';
```

## Troubleshooting Queries

### Check schedule with data source and worker status

```sql
SELECT 
    fs.name,
    fs.worker_id,
    fs.is_enabled AS schedule_enabled,
    ds.name AS data_source,
    ds.is_active AS data_source_active,
    wr.name AS worker_name
FROM worker_fetch_schedules fs
JOIN data_sources ds ON fs.data_source_id = ds.id
LEFT JOIN worker_registry wr ON fs.worker_id = wr.id;
```

### View last run details

```sql
SELECT 
    name,
    worker_id,
    last_run_at,
    last_run_status,
    last_run_message
FROM worker_fetch_schedules
ORDER BY last_run_at DESC;
```
