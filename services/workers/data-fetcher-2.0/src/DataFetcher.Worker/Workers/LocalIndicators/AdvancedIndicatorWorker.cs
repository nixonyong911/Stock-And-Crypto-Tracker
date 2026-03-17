using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.LocalIndicators;

/// <summary>
/// Background worker that computes advanced technical indicators
/// (Bollinger Bands, ATR, Stochastic, ADX, OBV, Fibonacci, Pivot Points, Ichimoku)
/// locally from candlestick analysis data. Runs on the same schedule as the basic
/// indicator worker, offset by 2 minutes to avoid overlap.
/// </summary>
public class AdvancedIndicatorWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AdvancedIndicatorWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "LocalCompute";
    private const string ScheduleName = "Local Indicator Computation";
    private const string WorkerVersion = "1.0.0";
    private const string MetricsPrefix = "advanced_indicator";
    private static readonly TimeSpan ScheduleOffset = TimeSpan.FromMinutes(2);

    public AdvancedIndicatorWorker(
        IServiceProvider serviceProvider,
        ILogger<AdvancedIndicatorWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Advanced Indicator Worker starting");
        await ReportWorkerStartAsync();
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

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

                    delay += ScheduleOffset;

                    _logger.LogInformation(
                        "Advanced schedule loaded ({Mode}). Next run ~{NextRunUtc} UTC (+{Offset}s offset)",
                        schedule.IntervalMinutes.HasValue ? $"every {schedule.IntervalMinutes}min" : "daily",
                        nextRunUtc.Add(ScheduleOffset).ToString("HH:mm"),
                        ScheduleOffset.TotalSeconds);

                    try
                    {
                        await Task.Delay(delay, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }

                    _logger.LogInformation("Starting advanced indicator computation at {Time} UTC", DateTime.UtcNow);
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    var startedAt = DateTime.UtcNow;

                    try
                    {
                        using var computeScope = _serviceProvider.CreateScope();
                        var calculator = computeScope.ServiceProvider.GetRequiredService<IAdvancedIndicatorCalculatorService>();

                        var stockResult = await calculator.ComputeAllStockAdvancedIndicatorsAsync(stoppingToken);
                        var cryptoResult = await calculator.ComputeAllCryptoAdvancedIndicatorsAsync(stoppingToken);

                        var message = $"Stocks: {stockResult.SuccessCount}/{stockResult.TotalTickers} ({stockResult.SkippedCount} skipped, {stockResult.DurationSeconds:F1}s) | " +
                                      $"Crypto: {cryptoResult.SuccessCount}/{cryptoResult.TotalTickers} ({cryptoResult.SkippedCount} skipped, {cryptoResult.DurationSeconds:F1}s)";

                        var allErrors = stockResult.Errors.Concat(cryptoResult.Errors).ToList();
                        if (allErrors.Count > 0)
                            message += $" | Errors: {string.Join("; ", allErrors.Take(3))}";

                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "completed" });

                        _logger.LogInformation("Advanced indicator computation complete: {Message}", message);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error during advanced indicator computation");
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
                    _logger.LogError(ex, "Unexpected error in advanced indicator worker loop");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
        }

        _logger.LogInformation("Advanced Indicator Worker stopped");
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
                    ["worker_name"] = "advanced-indicator"
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
