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

                    var pipelineSchedule = await scheduleRepository.GetScheduleByNameAsync("pipeline-orchestrator-stock");
                    if (pipelineSchedule?.LastRunAt != null &&
                        DateTime.UtcNow - pipelineSchedule.LastRunAt.Value < TimeSpan.FromMinutes(schedule.IntervalMinutes ?? 30))
                    {
                        _logger.LogInformation("Skipping timer-triggered candlestick analysis — pipeline orchestrator already ran at {LastRun}", pipelineSchedule.LastRunAt);
                        continue;
                    }

                    _logger.LogInformation("Starting scheduled analysis for '{ScheduleName}' at {Time} UTC",
                        schedule.Name, DateTime.UtcNow);

                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    var startedAt = DateTime.UtcNow;
                    const int maxRetries = 2;
                    for (var attempt = 0; attempt <= maxRetries; attempt++)
                    {
                        try
                        {
                            using var analysisScope = _serviceProvider.CreateScope();
                            var analysisService = analysisScope.ServiceProvider.GetRequiredService<ICandlestickAnalysisService>();
                            var fetchScheduleRepo = analysisScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                            var yesterday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz).AddDays(-1));
                            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz));

                            _logger.LogInformation("Analyzing candlestick patterns: confirmed={Yesterday}, developing={Today}", yesterday, today);

                            var result = await analysisService.AnalyzeAllStocksAsync(yesterday, stoppingToken);

                            var statusMessage = $"Stock confirmed: {result.SuccessCount}/{result.TotalStocks}, " +
                                              $"{result.PatternsDetected} patterns, {result.DurationSeconds:F1}s";

                            var developingResult = await analysisService.AnalyzeDevelopingStocksAsync(today, stoppingToken);
                            statusMessage += $" | Stock developing: {developingResult.SuccessCount}/{developingResult.TotalStocks}, " +
                                           $"{developingResult.PatternsDetected} patterns";

                            var weeklyResult = await analysisService.AnalyzeWeeklyStocksAsync(today, stoppingToken);
                            if (weeklyResult.TotalStocks > 0)
                            {
                                statusMessage += $" | Stock weekly: {weeklyResult.SuccessCount}/{weeklyResult.TotalStocks}, " +
                                               $"{weeklyResult.PatternsDetected} patterns";
                            }

                            var cryptoAnalysisService = analysisScope.ServiceProvider.GetRequiredService<ICryptoCandlestickAnalysisService>();

                            var cryptoResult = await cryptoAnalysisService.AnalyzeAllCryptoAsync(yesterday, stoppingToken);
                            statusMessage += $" | Crypto confirmed: {cryptoResult.SuccessCount}/{cryptoResult.TotalCrypto}, " +
                                           $"{cryptoResult.PatternsDetected} patterns";

                            var cryptoDevelopingResult = await cryptoAnalysisService.AnalyzeDevelopingCryptoAsync(today, stoppingToken);
                            statusMessage += $" | Crypto developing: {cryptoDevelopingResult.SuccessCount}/{cryptoDevelopingResult.TotalCrypto}, " +
                                           $"{cryptoDevelopingResult.PatternsDetected} patterns";

                            var cryptoWeeklyResult = await cryptoAnalysisService.AnalyzeWeeklyCryptoAsync(today, stoppingToken);
                            if (cryptoWeeklyResult.TotalCrypto > 0)
                            {
                                statusMessage += $" | Crypto weekly: {cryptoWeeklyResult.SuccessCount}/{cryptoWeeklyResult.TotalCrypto}, " +
                                               $"{cryptoWeeklyResult.PatternsDetected} patterns";
                            }

                            var allErrors = result.Errors
                                .Concat(developingResult.Errors)
                                .Concat(weeklyResult.Errors)
                                .Concat(cryptoResult.Errors)
                                .Concat(cryptoDevelopingResult.Errors)
                                .Concat(cryptoWeeklyResult.Errors)
                                .ToList();
                            if (allErrors.Count > 0)
                            {
                                statusMessage += $". Errors: {string.Join("; ", allErrors.Take(3))}";
                            }

                            if (attempt > 0)
                                statusMessage += $" | Succeeded on retry {attempt}";

                            var overallSuccess = result.Success && developingResult.Success
                                && weeklyResult.Success && cryptoResult.Success
                                && cryptoDevelopingResult.Success && cryptoWeeklyResult.Success;

                            await fetchScheduleRepo.UpdateLastRunAsync(
                                schedule.Id,
                                overallSuccess ? "success" : "partial",
                                statusMessage);

                            await fetchScheduleRepo.LogExecutionAsync(
                                schedule.Id,
                                overallSuccess ? "success" : "partial",
                                statusMessage,
                                (int)(DateTime.UtcNow - startedAt).TotalMilliseconds,
                                startedAt);

                            await _metrics.IncrementCounterAsync("job_executions_total", 1,
                                new Dictionary<string, string> { ["status"] = "completed" });
                            break;
                        }
                        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                        {
                            throw;
                        }
                        catch (Exception ex) when (attempt < maxRetries && IsTransient(ex))
                        {
                            _logger.LogWarning(ex, "Transient error during candlestick analysis (attempt {Attempt}/{Max}), retrying in 5s",
                                attempt + 1, maxRetries + 1);
                            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error occurred during candlestick analysis operation (attempt {Attempt}/{Max})",
                                attempt + 1, maxRetries + 1);

                            using var errorScope = _serviceProvider.CreateScope();
                            var fetchScheduleRepo = errorScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                            await fetchScheduleRepo.UpdateLastRunAsync(schedule.Id, "failed", ex.Message);

                            await fetchScheduleRepo.LogExecutionAsync(
                                schedule.Id, "failed", ex.Message,
                                (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);

                            await _metrics.IncrementCounterAsync("job_executions_total", 1,
                                new Dictionary<string, string> { ["status"] = "failed" });
                            break;
                        }
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

    private static bool IsTransient(Exception ex)
    {
        if (ex is TimeoutException) return true;
        if (ex.InnerException is TimeoutException) return true;
        var typeName = ex.GetType().FullName ?? "";
        return typeName.Contains("Npgsql") || typeName.Contains("Socket");
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
