using DataFetcher.Worker.Application.Providers.AlphaVantage;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.AlphaVantage;

/// <summary>
/// Background worker that fetches earnings calendar from Alpha Vantage on a monthly schedule.
/// Runs on the 1st day of every month.
/// </summary>
public class AlphaVantageFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AlphaVantageFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "AlphaVantage";
    private const string WorkerVersion = "1.0.0";
    private const string MetricsPrefix = "data_fetcher_2_alphavantage";

    public AlphaVantageFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<AlphaVantageFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AlphaVantage Fetch Worker starting (data-fetcher-2.0)");
        await ReportWorkerStartAsync();

        // Wait for other services to initialize
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_last_activity_timestamp",
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var earningsService = scope.ServiceProvider.GetRequiredService<IEarningsCalendarService>();

                // Get schedule from database (optional - can run without schedule)
                var schedule = await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                // Calculate delay until 1st of next month at 00:00 UTC
                var (delay, nextRunUtc) = CalculateDelayUntilFirstOfMonth();

                // If schedule exists and is enabled, use its time; otherwise default to 1st of month
                if (schedule != null && schedule.IsEnabled)
                {
                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded. Next run on {NextRunDate} (in {Days}d {Hours}h)",
                        schedule.Name,
                        nextRunUtc.ToString("yyyy-MM-dd"),
                        (int)delay.TotalDays,
                        delay.Hours);
                }
                else
                {
                    _logger.LogInformation(
                        "No enabled schedule found for {DataSource}. Using default monthly schedule. Next run on {NextRunDate} (in {Days}d {Hours}h)",
                        DataSourceName,
                        nextRunUtc.ToString("yyyy-MM-dd"),
                        (int)delay.TotalDays,
                        delay.Hours);
                }

                await Task.Delay(delay, stoppingToken);

                if (stoppingToken.IsCancellationRequested) break;

                // Execute the work
                var status = "completed";
                string? message = null;

                try
                {
                    _logger.LogInformation("Starting scheduled earnings calendar fetch from Alpha Vantage");

                    var count = await earningsService.SyncAllEarningsCalendarAsync(stoppingToken);

                    message = $"Synced {count} earnings events";

                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "completed" });

                    _logger.LogInformation("Completed scheduled fetch: {Message}", message);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during scheduled earnings fetch");
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
            _logger.LogInformation("AlphaVantage Fetch Worker stopped");
        }
    }

    /// <summary>
    /// Calculates the delay until the 1st of next month at 00:00 UTC.
    /// </summary>
    private static (TimeSpan delay, DateTime nextRunUtc) CalculateDelayUntilFirstOfMonth()
    {
        var now = DateTime.UtcNow;
        
        // Calculate 1st of next month at 00:00 UTC
        DateTime nextRun;
        if (now.Day == 1 && now.Hour < 1)
        {
            // It's currently the 1st and before 01:00, run soon
            nextRun = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                .AddHours(1); // Run at 01:00 UTC to give some buffer
        }
        else
        {
            // Schedule for 1st of next month
            var nextMonth = now.AddMonths(1);
            nextRun = new DateTime(nextMonth.Year, nextMonth.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        }

        var delay = nextRun - now;
        
        // Minimum delay of 1 minute to prevent tight loops
        if (delay < TimeSpan.FromMinutes(1))
        {
            delay = TimeSpan.FromMinutes(1);
        }

        return (delay, nextRun);
    }

    private async Task ReportWorkerStartAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 1);
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_info", 1,
            new Dictionary<string, string>
            {
                ["version"] = WorkerVersion,
                ["worker_name"] = "alphavantage",
                ["service"] = "data-fetcher-2.0"
            });
    }

    private async Task ReportWorkerStopAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 0);
    }
}
