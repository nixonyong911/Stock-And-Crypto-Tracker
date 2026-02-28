using System.Text.Json;
using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.CandlestickAnalysis;

/// <summary>
/// Background worker that runs candlestick pattern analysis at scheduled time.
/// Default schedule: 01:00 UTC (3 hours after TwelveData at 22:00 UTC).
/// </summary>
public class CandlestickAnalysisWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CandlestickAnalysisWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "CandlestickAnalysis";
    private const string WorkerVersion = "1.0.0";

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

        // Wait a bit for the database to be ready
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                        DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                    // Load schedule from database
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

                    // Parse analysis config
                    var config = !string.IsNullOrEmpty(schedule.FetchConfig)
                        ? JsonSerializer.Deserialize<AnalysisConfig>(schedule.FetchConfig) ?? new AnalysisConfig()
                        : new AnalysisConfig();

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

                    // Wait until scheduled time
                    try
                    {
                        await Task.Delay(delay, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }

                    // Execute analysis
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

                        // Immediately run crypto analysis (no external API, no rate limit concern)
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
    /// Calculate delay until the next occurrence of the scheduled time.
    /// Converts from the specified timezone to UTC, handling DST automatically.
    /// </summary>
    private static (TimeSpan delay, DateTime nextRunUtc) CalculateDelayUntilScheduledTime(TimeSpan scheduleTime, string scheduleTimezone)
    {
        var now = DateTime.UtcNow;

        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(scheduleTimezone);
        }
        catch (TimeZoneNotFoundException)
        {
            tz = TimeZoneInfo.Utc;
        }

        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(now, tz);
        var todayScheduledInTz = nowInTz.Date.Add(scheduleTime);

        if (nowInTz >= todayScheduledInTz)
        {
            todayScheduledInTz = todayScheduledInTz.AddDays(1);
        }

        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(todayScheduledInTz, tz);
        var delay = scheduledUtc - now;

        return (delay, scheduledUtc);
    }

    /// <summary>
    /// Get the date to analyze based on config.
    /// </summary>
    private static DateOnly GetAnalyzeDate(string analyzeDateConfig)
    {
        return analyzeDateConfig.ToLower() switch
        {
            "yesterday" => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)),
            "today" => DateOnly.FromDateTime(DateTime.UtcNow),
            _ => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1))
        };
    }
}
