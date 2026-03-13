using DataFetcher.Worker.Application.Providers.Fred;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Fred;

public class FredFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FredFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string ScheduleName = "FRED Daily Macro Fetch";
    private const string MetricsPrefix = "data_fetcher_2_fred";

    public FredFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<FredFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("FRED Fetch Worker starting");
        await ReportWorkerStartAsync();
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                    var schedule = await scheduleRepo.GetScheduleByNameAsync(ScheduleName);

                    if (schedule == null || !schedule.IsEnabled)
                    {
                        _logger.LogWarning("No enabled schedule found for {ScheduleName}, waiting 1 hour", ScheduleName);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    var (delay, nextRunUtc) = IntervalScheduleHelper.CalculateDelayUntilScheduledTime(
                        schedule.ScheduleTime, schedule.ScheduleTimezone);

                    _logger.LogInformation(
                        "FRED fetch scheduled. Next run at {NextRunUtc} UTC, in {Hours}h {Minutes}m",
                        nextRunUtc.ToString("HH:mm"),
                        (int)delay.TotalHours,
                        delay.Minutes);

                    try
                    {
                        await Task.Delay(delay, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }

                    var startedAt = DateTime.UtcNow;
                    var status = "success";
                    string? message = null;

                    try
                    {
                        using var fetchScope = _serviceProvider.CreateScope();
                        var fetchService = fetchScope.ServiceProvider.GetRequiredService<IFredFetchService>();
                        var (successCount, errorCount) = await fetchService.FetchAllIndicatorsAsync(stoppingToken);

                        if (errorCount > 0 && successCount == 0) status = "failed";
                        else if (errorCount > 0) status = "partial";

                        message = $"Fetched {successCount} indicators, {errorCount} errors";
                        _logger.LogInformation("FRED fetch complete: {Message}", message);

                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = status });
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        status = "failed";
                        message = ex.Message;
                        _logger.LogError(ex, "Error during FRED indicator fetch");

                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "failed" });
                    }

                    using var statusScope = _serviceProvider.CreateScope();
                    var statusScheduleRepo = statusScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                    var updatedSchedule = await statusScheduleRepo.GetScheduleByNameAsync(ScheduleName);
                    if (updatedSchedule != null)
                    {
                        await statusScheduleRepo.UpdateLastRunAsync(updatedSchedule.Id, status, message);
                        await statusScheduleRepo.LogExecutionAsync(updatedSchedule.Id, status, message,
                            (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in FRED fetch worker loop");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
            _logger.LogInformation("FRED Fetch Worker stopped");
        }
    }

    private async Task ReportWorkerStartAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync($"{MetricsPrefix}_fetch_worker_up", 1);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report worker start metrics");
        }
    }

    private async Task ReportWorkerStopAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync($"{MetricsPrefix}_fetch_worker_up", 0);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report worker stop metrics");
        }
    }
}
