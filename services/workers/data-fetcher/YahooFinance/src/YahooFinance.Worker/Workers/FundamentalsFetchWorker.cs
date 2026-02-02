using Microsoft.Extensions.Logging;
using StockTracker.Common.Metrics;
using YahooFinance.Worker.Repositories;
using YahooFinance.Worker.Services;

namespace YahooFinance.Worker.Workers;

/// <summary>
/// Background worker that fetches Yahoo Finance fundamentals on a schedule.
/// Schedule is read from worker_fetch_schedules table.
/// </summary>
public class FundamentalsFetchWorker : BackgroundService
{
    private const string DataSourceName = "YahooFinance";

    private readonly IServiceProvider _serviceProvider;
    private readonly IMetricsClient _metricsClient;
    private readonly ILogger<FundamentalsFetchWorker> _logger;

    public FundamentalsFetchWorker(
        IServiceProvider serviceProvider,
        IMetricsClient metricsClient,
        ILogger<FundamentalsFetchWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _metricsClient = metricsClient;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("FundamentalsFetchWorker starting. Data source: {DataSource}", DataSourceName);

        // Set worker_up gauge
        await _metricsClient.SetGaugeAsync("worker_up", 1);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                var schedule = await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                if (schedule == null || !schedule.IsEnabled)
                {
                    _logger.LogWarning("No active schedule found for {DataSource}, waiting 1 hour", DataSourceName);
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                    continue;
                }

                var delay = CalculateDelay(schedule.ScheduleTime, schedule.ScheduleTimezone);
                _logger.LogInformation(
                    "Next fetch scheduled in {Delay} at {Time} {Timezone}",
                    delay, schedule.ScheduleTime, schedule.ScheduleTimezone);

                await Task.Delay(delay, stoppingToken);

                if (stoppingToken.IsCancellationRequested)
                    break;

                await ExecuteFetchAsync(schedule.Id, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("FundamentalsFetchWorker stopping due to cancellation");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in FundamentalsFetchWorker loop");
                await _metricsClient.IncrementCounterAsync("fetch_errors_total", 1, new Dictionary<string, string>
                {
                    ["error_type"] = "worker_loop"
                });

                // Wait before retrying
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
        }

        await _metricsClient.SetGaugeAsync("worker_up", 0);
        _logger.LogInformation("FundamentalsFetchWorker stopped");
    }

    private async Task ExecuteFetchAsync(int scheduleId, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting scheduled fundamentals fetch");
        var startTime = DateTime.UtcNow;

        using var scope = _serviceProvider.CreateScope();
        var fetchService = scope.ServiceProvider.GetRequiredService<IFundamentalsFetchService>();
        var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

        try
        {
            var count = await fetchService.FetchAllFundamentalsAsync(cancellationToken);

            var duration = (DateTime.UtcNow - startTime).TotalSeconds;
            var message = $"Processed {count} tickers in {duration:F2}s";

            await scheduleRepo.UpdateLastRunAsync(scheduleId, "success", message);
            _logger.LogInformation("Scheduled fetch completed: {Message}", message);
        }
        catch (Exception ex)
        {
            var message = $"Fetch failed: {ex.Message}";
            await scheduleRepo.UpdateLastRunAsync(scheduleId, "error", message);
            _logger.LogError(ex, "Scheduled fetch failed");
            throw;
        }
    }

    private static TimeSpan CalculateDelay(TimeSpan scheduleTime, string timezone)
    {
        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        }
        catch
        {
            // Fallback to UTC if timezone not found
            tz = TimeZoneInfo.Utc;
        }

        var nowUtc = DateTime.UtcNow;
        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, tz);
        var scheduledToday = nowInTz.Date.Add(scheduleTime);

        if (nowInTz >= scheduledToday)
        {
            // Already passed today, schedule for tomorrow
            scheduledToday = scheduledToday.AddDays(1);
        }

        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(scheduledToday, tz);
        return scheduledUtc - nowUtc;
    }
}
