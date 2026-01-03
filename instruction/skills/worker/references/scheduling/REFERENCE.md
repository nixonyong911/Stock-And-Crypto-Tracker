# Scheduling Implementation Reference

Workers use database-driven scheduling via `BackgroundService`. Polls `fetch_schedules`, calculates delay, executes at scheduled time.

**Reference:** `services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/`

## Required Components

| Component | Location |
|-----------|----------|
| `FetchSchedule` model | `Models/` - maps to `fetch_schedules` table |
| `IFetchScheduleRepository` | `Repositories/` - queries schedule from DB |
| `{Worker}Worker` | `Workers/` - BackgroundService with loop |

## Worker Loop Pattern

```csharp
public class YourWorker : BackgroundService
{
    private const string DataSourceName = "YourWorkerName";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var schedule = await _scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);
            if (schedule == null || !schedule.IsEnabled) { await Task.Delay(TimeSpan.FromHours(1), stoppingToken); continue; }
            var delay = CalculateDelay(schedule.ScheduleTimeUtc);
            await Task.Delay(delay, stoppingToken);
            await ExecuteWorkAsync(schedule, stoppingToken);
        }
    }

    private static TimeSpan CalculateDelay(TimeSpan scheduleTimeUtc)
    {
        var now = DateTime.UtcNow;
        var scheduled = now.Date.Add(scheduleTimeUtc);
        return now >= scheduled ? scheduled.AddDays(1) - now : scheduled - now;
    }
}
```

## Registration
```csharp
builder.Services.AddScoped<IFetchScheduleRepository, FetchScheduleRepository>();
builder.Services.AddHostedService<YourWorker>();
```

**Behaviors:** No schedule/disabled → wait 1hr retry | Time passed → calculate tomorrow
