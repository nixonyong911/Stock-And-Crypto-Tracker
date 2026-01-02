# Scheduling Implementation Reference

## Overview

Workers use database-driven scheduling via `BackgroundService`. The worker continuously polls the `fetch_schedules` table, calculates delay until the scheduled time, then executes.

**Reference implementation:** `services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/`

---

## Required Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `FetchSchedule` model | `Models/FetchSchedule.cs` | Maps to `fetch_schedules` table |
| `FetchConfig` model | `Models/FetchConfig.cs` | Deserializes `fetch_config` JSONB |
| `IFetchScheduleRepository` | `Repositories/` | Queries schedule from DB |
| `{Worker}Worker` | `Workers/` | BackgroundService with scheduling loop |

---

## Database Schema

### fetch_schedules table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | int | Primary key |
| `data_source_id` | int | FK to data_sources |
| `name` | varchar | Schedule name |
| `schedule_time_utc` | time | Daily execution time (e.g., '22:00:00') |
| `is_enabled` | bool | Enable/disable toggle |
| `fetch_config` | jsonb | Worker-specific config |
| `last_run_at` | timestamp | Last execution time |
| `last_run_status` | varchar | 'success' or 'failed' |

---

## Implementation Patterns

### 1. FetchSchedule Model

```csharp
public class FetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public TimeSpan ScheduleTimeUtc { get; set; }
    public bool IsEnabled { get; set; }
    public string FetchConfig { get; set; } = "{}";
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
}
```

### 2. Repository Query

```csharp
public async Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName)
{
    const string sql = @"
        SELECT fs.id, fs.schedule_time_utc as ScheduleTimeUtc, 
               fs.is_enabled as IsEnabled, fs.fetch_config as FetchConfig
        FROM fetch_schedules fs
        INNER JOIN data_sources ds ON fs.data_source_id = ds.id
        WHERE ds.name = @DataSourceName AND fs.is_enabled = true";
    
    return await connection.QueryFirstOrDefaultAsync<FetchSchedule>(sql, new { DataSourceName = dataSourceName });
}
```

### 3. Worker Loop Pattern

```csharp
public class YourWorker : BackgroundService
{
    private const string DataSourceName = "YourWorkerName";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var schedule = await scheduleRepository.GetScheduleByDataSourceNameAsync(DataSourceName);
            
            if (schedule == null || !schedule.IsEnabled)
            {
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                continue;
            }

            var delay = CalculateDelayUntilScheduledTime(schedule.ScheduleTimeUtc);
            await Task.Delay(delay, stoppingToken);
            
            // Execute your fetch/analysis logic here
            await ExecuteWorkAsync(schedule, stoppingToken);
        }
    }

    private static TimeSpan CalculateDelayUntilScheduledTime(TimeSpan scheduleTimeUtc)
    {
        var now = DateTime.UtcNow;
        var todayScheduled = now.Date.Add(scheduleTimeUtc);
        
        if (now >= todayScheduled)
            todayScheduled = todayScheduled.AddDays(1);
        
        return todayScheduled - now;
    }
}
```

### 4. Register in Program.cs

```csharp
builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();
builder.Services.AddHostedService<YourWorker>();
```

---

## FetchConfig Examples

```json
// Data fetcher config
{"exchange": "NASDAQ", "interval": "15min", "output_size": 30, "rate_limit_delay_seconds": 8}

// Analysis worker config  
{"analyze_date": "yesterday", "batch_size": 100}
```

---

## Key Behaviors

| Scenario | Behavior |
|----------|----------|
| No schedule found | Wait 1 hour, retry |
| Schedule disabled | Wait 1 hour, retry |
| After execution | Wait 1 minute, re-check schedule |
| Schedule time passed today | Calculate for tomorrow |

