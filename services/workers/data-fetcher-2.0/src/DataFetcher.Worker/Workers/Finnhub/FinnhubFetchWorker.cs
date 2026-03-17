using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Finnhub;

/// <summary>
/// Background worker that fetches stock fundamentals from Finnhub on a schedule.
/// Note: Earnings calendar functionality has been moved to AlphaVantage provider.
/// </summary>
public class FinnhubFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FinnhubFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "Finnhub";
    private const string WorkerVersion = "2.0.0";
    private const string MetricsPrefix = "data_fetcher_2_finnhub";

    public FinnhubFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<FinnhubFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Finnhub Fetch Worker starting (data-fetcher-2.0)");
        await ReportWorkerStartAsync();

        // Wait for other services to initialize
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_last_activity_timestamp",
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var fundamentalsService = scope.ServiceProvider.GetRequiredService<IFundamentalsFetchService>();

                // Get schedule from database
                var schedule = await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                if (schedule == null || !schedule.IsEnabled)
                {
                    _logger.LogWarning("No enabled schedule found for {DataSource}, waiting 1 hour", DataSourceName);
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                    continue;
                }

                // Calculate delay until next scheduled run (timezone-aware)
                var (delay, nextRunUtc) = CalculateDelayUntilScheduledTime(schedule.ScheduleTime, schedule.ScheduleTimezone);

                _logger.LogInformation(
                    "Schedule '{ScheduleName}' loaded. Next run at {ScheduleTime} {Timezone} ({NextRunUtc} UTC, in {Hours}h {Minutes}m)",
                    schedule.Name,
                    schedule.ScheduleTime,
                    schedule.ScheduleTimezone,
                    nextRunUtc.ToString("HH:mm"),
                    (int)delay.TotalHours,
                    delay.Minutes);

                await Task.Delay(delay, stoppingToken);

                if (stoppingToken.IsCancellationRequested) break;

                // Execute the work
                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    _logger.LogInformation("Starting scheduled fundamentals fetch");

                    // Fetch fundamentals for tickers with recent earnings
                    // Note: Earnings calendar is now synced by AlphaVantage provider (monthly)
                    var fundamentalsCount = await fundamentalsService.FetchFundamentalsForRecentEarningsAsync(
                        withinDays: 2, cancellationToken: stoppingToken);

                    message = $"Fetched {fundamentalsCount} fundamentals for tickers with recent earnings";

                    var externalService = scope.ServiceProvider.GetRequiredService<IFinnhubExternalIndicatorService>();
                    _logger.LogInformation("Starting Finnhub external indicator fetch for all active tickers");
                    var externalResult = await externalService.FetchAllStockExternalIndicatorsAsync(stoppingToken);

                    message += $" | External: {externalResult.SuccessCount}/{externalResult.TotalTickers} ({externalResult.DurationSeconds:F1}s)";
                    if (externalResult.Errors.Count > 0)
                        message += $" | ExtErrors: {string.Join("; ", externalResult.Errors.Take(3))}";

                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "completed" });

                    _logger.LogInformation("Completed scheduled fetch: {Message}", message);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during scheduled fundamentals fetch");
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "failed" });
                }
                finally
                {
                    // Update last run with status and message
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
            _logger.LogInformation("Finnhub Fetch Worker stopped");
        }
    }

    /// <summary>
    /// Calculates the delay until the next scheduled run time, accounting for timezone.
    /// </summary>
    private static (TimeSpan delay, DateTime nextRunUtc) CalculateDelayUntilScheduledTime(TimeSpan scheduleTime, string scheduleTimezone)
    {
        var now = DateTime.UtcNow;

        // Get the timezone info
        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(scheduleTimezone);
        }
        catch (TimeZoneNotFoundException)
        {
            // Fallback to UTC if timezone not found
            tz = TimeZoneInfo.Utc;
        }

        // Get current time in the target timezone
        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(now, tz);

        // Calculate today's scheduled time in target timezone
        var todayScheduledInTz = nowInTz.Date.Add(scheduleTime);

        // If scheduled time has passed today, schedule for tomorrow
        if (todayScheduledInTz <= nowInTz)
        {
            todayScheduledInTz = todayScheduledInTz.AddDays(1);
        }

        // Convert scheduled time back to UTC
        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(todayScheduledInTz, tz);

        // Calculate delay
        var delay = scheduledUtc - now;

        return (delay, scheduledUtc);
    }

    private async Task ReportWorkerStartAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 1);
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_info", 1,
            new Dictionary<string, string>
            {
                ["version"] = WorkerVersion,
                ["worker_name"] = "finnhub",
                ["service"] = "data-fetcher-2.0"
            });
    }

    private async Task ReportWorkerStopAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 0);
    }
}
