using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Fred;

public class FredCalendarSyncWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FredCalendarSyncWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string MetricsPrefix = "data_fetcher_2_fred";
    private const string ScheduleTimezone = "America/New_York";
    private static readonly DayOfWeek SyncDay = DayOfWeek.Sunday;
    private static readonly TimeSpan SyncTime = TimeSpan.Zero; // 00:00

    public FredCalendarSyncWorker(
        IServiceProvider serviceProvider,
        ILogger<FredCalendarSyncWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("FRED Calendar Sync Worker starting");
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        // Run initial sync on startup
        await RunCalendarSyncAsync(stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var delay = CalculateDelayUntilNextWeeklyRun();
                _logger.LogInformation("Next FRED calendar sync in {Hours}h {Minutes}m",
                    (int)delay.TotalHours, delay.Minutes);

                try
                {
                    await Task.Delay(delay, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }

                await RunCalendarSyncAsync(stoppingToken);
            }
        }
        finally
        {
            _logger.LogInformation("FRED Calendar Sync Worker stopped");
        }
    }

    private async Task RunCalendarSyncAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var syncService = scope.ServiceProvider.GetRequiredService<IFredCalendarSyncService>();
            var (successCount, errorCount) = await syncService.SyncCalendarAsync(stoppingToken);

            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_calendar_sync_total", 1,
                new Dictionary<string, string> { ["status"] = errorCount == 0 ? "success" : "partial" });

            _logger.LogInformation("FRED calendar sync complete: {Success} success, {Errors} errors",
                successCount, errorCount);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during FRED calendar sync");
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_calendar_sync_total", 1,
                new Dictionary<string, string> { ["status"] = "failed" });
        }
    }

    private TimeSpan CalculateDelayUntilNextWeeklyRun()
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById(ScheduleTimezone);
            var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);

            var daysUntilTarget = ((int)SyncDay - (int)nowInTz.DayOfWeek + 7) % 7;
            var scheduled = nowInTz.Date.AddDays(daysUntilTarget).Add(SyncTime);

            if (daysUntilTarget == 0 && nowInTz >= scheduled)
                scheduled = scheduled.AddDays(7);

            var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(scheduled, tz);
            var delay = scheduledUtc - DateTime.UtcNow;
            return delay < TimeSpan.Zero ? TimeSpan.Zero : delay;
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeSpan.FromDays(7);
        }
    }
}
