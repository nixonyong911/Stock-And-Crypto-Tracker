using DataFetcher.Worker.Application.Scheduling;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Scheduling;

/// <summary>
/// Background worker that synchronizes earnings data monthly by combining
/// Alpha Vantage (upcoming dates) and Finnhub (historical actuals).
/// Runs on the 1st of each month.
/// </summary>
public class EarningsSyncWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<EarningsSyncWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string ScheduleName = "Monthly Earnings Sync";
    private const string WorkerVersion = "1.0.0";
    private const string MetricsPrefix = "data_fetcher_2_earnings_sync";

    public EarningsSyncWorker(
        IServiceProvider serviceProvider,
        ILogger<EarningsSyncWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Earnings Sync Worker starting (data-fetcher-2.0)");
        await ReportWorkerStartAsync();

        // Wait for other services to initialize
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_last_activity_timestamp",
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var earningsSyncService = scope.ServiceProvider.GetRequiredService<IEarningsSyncService>();

                // Get schedule from database (optional - can run without schedule)
                var schedule = await scheduleRepo.GetScheduleByNameAsync(ScheduleName);

                // Calculate delay until 1st of next month
                var (delay, nextRunUtc) = CalculateDelayUntilFirstOfMonth(schedule?.ScheduleTime, schedule?.ScheduleTimezone);

                if (schedule != null && schedule.IsEnabled)
                {
                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded. Next run on {NextRunDate} at {Time} (in {Days}d {Hours}h)",
                        schedule.Name,
                        nextRunUtc.ToString("yyyy-MM-dd"),
                        nextRunUtc.ToString("HH:mm"),
                        (int)delay.TotalDays,
                        delay.Hours);
                }
                else
                {
                    _logger.LogInformation(
                        "No enabled schedule found for {ScheduleName}. Using default monthly schedule. Next run on {NextRunDate} (in {Days}d {Hours}h)",
                        ScheduleName,
                        nextRunUtc.ToString("yyyy-MM-dd"),
                        (int)delay.TotalDays,
                        delay.Hours);
                }

                await Task.Delay(delay, stoppingToken);

                if (stoppingToken.IsCancellationRequested) break;

                // Execute the work
                var status = "success";
                string? message = null;

                try
                {
                    _logger.LogInformation("Starting scheduled earnings sync (AV + Finnhub)");

                    var result = await earningsSyncService.SyncAllTickersAsync(stoppingToken);

                    message = $"Synced {result.RecordsUpserted} records for {result.SuccessCount}/{result.TotalTickers} tickers, {result.ErrorCount} errors, Duration: {result.Duration.TotalSeconds:F1}s";

                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "completed" });

                    _logger.LogInformation("Completed scheduled earnings sync: {Message}", message);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during scheduled earnings sync");
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "failed" });
                }
                finally
                {
                    // Update last run with status and message (if schedule exists)
                    if (schedule != null)
                    {
                        await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    }
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
            _logger.LogInformation("Earnings Sync Worker stopped");
        }
    }

    /// <summary>
    /// Calculates the delay until the 1st of next month at the specified time.
    /// </summary>
    private static (TimeSpan delay, DateTime nextRunUtc) CalculateDelayUntilFirstOfMonth(TimeSpan? scheduleTime, string? scheduleTimezone)
    {
        var targetTime = scheduleTime ?? TimeSpan.FromHours(2); // Default: 02:00
        var timezone = scheduleTimezone ?? "America/New_York";

        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        }
        catch (TimeZoneNotFoundException)
        {
            tz = TimeZoneInfo.Utc;
        }

        var now = DateTime.UtcNow;
        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(now, tz);

        // Calculate 1st of next month at target time
        DateTime nextRun;
        if (nowInTz.Day == 1 && nowInTz.TimeOfDay < targetTime)
        {
            // It's currently the 1st and before target time, run today
            nextRun = nowInTz.Date.Add(targetTime);
        }
        else
        {
            // Schedule for 1st of next month
            var nextMonth = nowInTz.AddMonths(1);
            nextRun = new DateTime(nextMonth.Year, nextMonth.Month, 1, 0, 0, 0).Add(targetTime);
        }

        // Convert back to UTC
        var nextRunUtc = TimeZoneInfo.ConvertTimeToUtc(nextRun, tz);

        var delay = nextRunUtc - now;

        // Minimum delay of 1 minute to prevent tight loops
        if (delay < TimeSpan.FromMinutes(1))
        {
            delay = TimeSpan.FromMinutes(1);
        }

        return (delay, nextRunUtc);
    }

    private async Task ReportWorkerStartAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 1);
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_info", 1,
            new Dictionary<string, string>
            {
                ["version"] = WorkerVersion,
                ["worker_name"] = "earnings_sync",
                ["service"] = "data-fetcher-2.0"
            });
    }

    private async Task ReportWorkerStopAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 0);
    }
}
