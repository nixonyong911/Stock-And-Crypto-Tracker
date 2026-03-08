using System.Text.Json;
using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.CandlestickAnalysis;

/// <summary>
/// Background worker that runs candlestick pattern analysis on a schedule.
/// Supports both interval-based (e.g. every 30 min) and daily time-of-day scheduling
/// via the worker_fetch_schedules table.
/// </summary>
public class CandlestickAnalysisWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CandlestickAnalysisWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "CandlestickAnalysis";
    private const string WorkerVersion = "2.0.0";
    private static readonly TimeZoneInfo EasternTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public CandlestickAnalysisWorker(
        IServiceProvider serviceProvider,
        ILogger<CandlestickAnalysisWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Candlestick Analysis Worker starting");

        await ReportWorkerStartAsync();
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                        DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                    using var scope = _serviceProvider.CreateScope();
                    var scheduleRepository = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                    var schedule = await scheduleRepository.GetScheduleByDataSourceNameAsync(DataSourceName);

                    if (schedule == null)
                    {
                        _logger.LogWarning("No enabled schedule found for data source '{DataSource}'. Retrying in 1 hour.", DataSourceName);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    if (!schedule.IsEnabled)
                    {
                        _logger.LogInformation("Schedule '{ScheduleName}' is disabled. Checking again in 1 hour.", schedule.Name);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    var config = !string.IsNullOrEmpty(schedule.FetchConfig)
                        ? JsonSerializer.Deserialize<AnalysisConfig>(schedule.FetchConfig) ?? new AnalysisConfig()
                        : new AnalysisConfig();

                    var (delay, nextRunUtc) = schedule.IntervalMinutes.HasValue
                        ? IntervalScheduleHelper.CalculateDelayUntilNextInterval(schedule.IntervalMinutes.Value, schedule.OffsetMinutes)
                        : IntervalScheduleHelper.CalculateDelayUntilScheduledTime(schedule.ScheduleTime, schedule.ScheduleTimezone);

                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded ({Mode}). Next run at {NextRunUtc} UTC, in {Hours}h {Minutes}m {Seconds}s",
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

                    _logger.LogInformation("Starting scheduled analysis for '{ScheduleName}' at {Time} UTC",
                        schedule.Name, DateTime.UtcNow);

                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    try
                    {
                        using var analysisScope = _serviceProvider.CreateScope();
                        var analysisService = analysisScope.ServiceProvider.GetRequiredService<ICandlestickAnalysisService>();
                        var fetchScheduleRepo = analysisScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                        var analyzeDate = GetAnalyzeDate(config.AnalyzeDate);

                        _logger.LogInformation("Analyzing candlestick patterns for {Date}", analyzeDate);

                        var result = await analysisService.AnalyzeAllStocksAsync(analyzeDate, stoppingToken);

                        var statusMessage = $"Stock: {result.SuccessCount}/{result.TotalStocks} analyzed, " +
                                          $"{result.PatternsDetected} patterns, {result.DurationSeconds:F1}s";

                        _logger.LogInformation("Stock analysis complete. Starting crypto candlestick analysis for {Date}", analyzeDate);
                        var cryptoAnalysisService = analysisScope.ServiceProvider.GetRequiredService<ICryptoCandlestickAnalysisService>();
                        var cryptoResult = await cryptoAnalysisService.AnalyzeAllCryptoAsync(analyzeDate, stoppingToken);

                        statusMessage += $" | Crypto: {cryptoResult.SuccessCount}/{cryptoResult.TotalCrypto} analyzed, " +
                                       $"{cryptoResult.PatternsDetected} patterns, {cryptoResult.DurationSeconds:F1}s";

                        var allErrors = result.Errors.Concat(cryptoResult.Errors).ToList();
                        if (allErrors.Count > 0)
                        {
                            statusMessage += $". Errors: {string.Join("; ", allErrors.Take(3))}";
                        }

                        var overallSuccess = result.Success && cryptoResult.Success;

                        await fetchScheduleRepo.UpdateLastRunAsync(
                            schedule.Id,
                            overallSuccess ? "success" : "partial",
                            statusMessage);

                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "completed" });
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        _logger.LogInformation("Candlestick Analysis Worker cancellation requested during analysis");
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error occurred during candlestick analysis operation");

                        using var errorScope = _serviceProvider.CreateScope();
                        var fetchScheduleRepo = errorScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                        await fetchScheduleRepo.UpdateLastRunAsync(schedule.Id, "failed", ex.Message);

                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "failed" });
                    }

                    if (!schedule.IntervalMinutes.HasValue)
                        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in worker loop");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
        }

        _logger.LogInformation("Candlestick Analysis Worker stopped");
    }

    private async Task ReportWorkerStartAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync("worker_up", 1);
            await _metrics.SetGaugeAsync("worker_info", 1,
                new Dictionary<string, string>
                {
                    ["version"] = WorkerVersion,
                    ["worker_name"] = "candlestick-analysis"
                });
            await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                DateTimeOffset.UtcNow.ToUnixTimeSeconds());
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
            await _metrics.SetGaugeAsync("worker_up", 0);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report worker stop metrics");
        }
    }

    /// <summary>
    /// Returns the current market date in Eastern Time. For interval-based scheduling,
    /// this gives us the "today" date so partial-day candles are continuously updated.
    /// Falls back to config-based date for backward compatibility.
    /// </summary>
    private static DateOnly GetAnalyzeDate(string analyzeDateConfig)
    {
        return analyzeDateConfig.ToLower() switch
        {
            "yesterday" => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz).AddDays(-1)),
            "today" => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz)),
            "latest" => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz)),
            _ => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz))
        };
    }
}
