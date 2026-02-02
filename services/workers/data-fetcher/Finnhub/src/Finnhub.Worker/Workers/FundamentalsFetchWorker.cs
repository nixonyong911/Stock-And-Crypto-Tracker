using Finnhub.Worker.Repositories;
using Finnhub.Worker.Services;
using StockTracker.Common.Metrics;

namespace Finnhub.Worker.Workers;

/// <summary>
/// Background worker that fetches stock fundamentals on a schedule.
/// </summary>
public class FundamentalsFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FundamentalsFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "Finnhub";
    private const string WorkerVersion = "1.0.0";

    public FundamentalsFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<FundamentalsFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Finnhub Fundamentals Worker starting");
        await ReportWorkerStartAsync();

        // Wait for other services to initialize
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var fundamentalsService = scope.ServiceProvider.GetRequiredService<IFundamentalsFetchService>();
                var earningsService = scope.ServiceProvider.GetRequiredService<IEarningsFetchService>();

                // Get schedule from database
                var schedule = await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                if (schedule == null || !schedule.IsEnabled)
                {
                    _logger.LogWarning("No enabled schedule found for {DataSource}, waiting 1 hour", DataSourceName);
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                    continue;
                }

                // Calculate delay until next scheduled run
                var delay = CalculateDelay(schedule.ScheduleTimeUtc);
                _logger.LogInformation("Next run scheduled at {Time} UTC (in {Delay})",
                    schedule.ScheduleTimeUtc, delay);

                await Task.Delay(delay, stoppingToken);

                if (stoppingToken.IsCancellationRequested) break;

                // Execute the work
                try
                {
                    _logger.LogInformation("Starting scheduled fundamentals fetch");

                    // First sync the earnings calendar
                    await earningsService.SyncEarningsCalendarAsync(cancellationToken: stoppingToken);

                    // Then fetch fundamentals for tickers with recent earnings
                    var count = await fundamentalsService.FetchFundamentalsForRecentEarningsAsync(
                        withinDays: 2, cancellationToken: stoppingToken);

                    // Update last run timestamp
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id);

                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "completed" });

                    _logger.LogInformation("Completed scheduled fundamentals fetch, processed {Count} tickers", count);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during scheduled fundamentals fetch");
                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "failed" });
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
            _logger.LogInformation("Finnhub Fundamentals Worker stopped");
        }
    }

    private TimeSpan CalculateDelay(TimeOnly scheduleTime)
    {
        var now = DateTime.UtcNow;
        var todaySchedule = now.Date.Add(scheduleTime.ToTimeSpan());

        if (todaySchedule > now)
        {
            return todaySchedule - now;
        }

        // Schedule for tomorrow
        return todaySchedule.AddDays(1) - now;
    }

    private async Task ReportWorkerStartAsync()
    {
        await _metrics.SetGaugeAsync("worker_up", 1);
        await _metrics.SetGaugeAsync("worker_info", 1,
            new Dictionary<string, string>
            {
                ["version"] = WorkerVersion,
                ["worker_name"] = "finnhub"
            });
    }

    private async Task ReportWorkerStopAsync()
    {
        await _metrics.SetGaugeAsync("worker_up", 0);
    }
}
