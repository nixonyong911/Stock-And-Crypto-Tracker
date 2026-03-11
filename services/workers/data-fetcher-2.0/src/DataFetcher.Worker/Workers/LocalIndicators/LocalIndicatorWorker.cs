using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.LocalIndicators;

/// <summary>
/// Background worker that computes technical indicators (SMA, EMA, MACD, RSI)
/// locally from candlestick analysis data on a 30-minute interval.
/// Replaces the Massive API dependency for scheduled indicator computation.
/// </summary>
public class LocalIndicatorWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<LocalIndicatorWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "LocalCompute";
    private const string ScheduleName = "Local Indicator Computation";
    private const string WorkerVersion = "1.0.0";
    private const string MetricsPrefix = "local_indicator";

    public LocalIndicatorWorker(
        IServiceProvider serviceProvider,
        ILogger<LocalIndicatorWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Local Indicator Worker starting");
        await ReportWorkerStartAsync();
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_last_activity_timestamp",
                        DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                    using var scope = _serviceProvider.CreateScope();
                    var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                    var schedule = await scheduleRepo.GetScheduleByNameAsync(ScheduleName);
                    schedule ??= await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                    if (schedule == null || !schedule.IsEnabled)
                    {
                        _logger.LogWarning("No enabled schedule found for '{Name}'. Retrying in 1 hour.", ScheduleName);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    var (delay, nextRunUtc) = schedule.IntervalMinutes.HasValue
                        ? IntervalScheduleHelper.CalculateDelayUntilNextInterval(schedule.IntervalMinutes.Value, schedule.OffsetMinutes)
                        : IntervalScheduleHelper.CalculateDelayUntilScheduledTime(schedule.ScheduleTime, schedule.ScheduleTimezone);

                    _logger.LogInformation(
                        "Schedule '{Name}' loaded ({Mode}). Next run at {NextRunUtc} UTC, in {Hours}h {Minutes}m {Seconds}s",
                        schedule.Name,
                        schedule.IntervalMinutes.HasValue ? $"every {schedule.IntervalMinutes}min, offset={schedule.OffsetMinutes}" : "daily",
                        nextRunUtc.ToString("HH:mm"),
                        (int)delay.TotalHours,
                        delay.Minutes,
                        delay.Seconds);

                    try
                    {
                        await Task.Delay(delay, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }

                    _logger.LogInformation("Starting local indicator computation at {Time} UTC", DateTime.UtcNow);
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    var startedAt = DateTime.UtcNow;
                    var status = "success";
                    string? message = null;

                    try
                    {
                        using var computeScope = _serviceProvider.CreateScope();
                        var calculator = computeScope.ServiceProvider.GetRequiredService<ILocalIndicatorCalculatorService>();
                        var fetchScheduleRepo = computeScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                        var stockResult = await calculator.ComputeAllStockIndicatorsAsync(stoppingToken);
                        var statusParts = new List<string>
                        {
                            $"Stocks: {stockResult.SuccessCount}/{stockResult.TotalTickers} ({stockResult.SkippedCount} skipped, {stockResult.DurationSeconds:F1}s)"
                        };

                        var cryptoResult = await calculator.ComputeAllCryptoIndicatorsAsync(stoppingToken);
                        statusParts.Add(
                            $"Crypto: {cryptoResult.SuccessCount}/{cryptoResult.TotalTickers} ({cryptoResult.SkippedCount} skipped, {cryptoResult.DurationSeconds:F1}s)");

                        var allErrors = stockResult.Errors.Concat(cryptoResult.Errors).ToList();
                        if (allErrors.Count > 0)
                            statusParts.Add($"Errors: {string.Join("; ", allErrors.Take(3))}");

                        message = string.Join(" | ", statusParts);
                        var overallSuccess = stockResult.Success && cryptoResult.Success;
                        status = overallSuccess ? "success" : "partial";

                        await fetchScheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                        await fetchScheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);

                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "completed" });

                        _logger.LogInformation("Local indicator computation complete: {Message}", message);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error during local indicator computation");

                        using var errorScope = _serviceProvider.CreateScope();
                        var fetchScheduleRepo = errorScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                        await fetchScheduleRepo.UpdateLastRunAsync(schedule.Id, "failed", ex.Message);
                        await fetchScheduleRepo.LogExecutionAsync(schedule.Id, "failed", ex.Message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);

                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "failed" });
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in local indicator worker loop");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
        }

        _logger.LogInformation("Local Indicator Worker stopped");
    }

    private async Task ReportWorkerStartAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 1);
            await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_info", 1,
                new Dictionary<string, string>
                {
                    ["version"] = WorkerVersion,
                    ["worker_name"] = "local-indicator"
                });
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
            await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 0);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report worker stop metrics");
        }
    }
}
