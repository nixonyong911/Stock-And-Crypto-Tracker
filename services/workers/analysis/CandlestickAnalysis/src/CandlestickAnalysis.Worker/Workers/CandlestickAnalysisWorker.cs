using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StockTracker.Common.Metrics;
using CandlestickAnalysis.Worker.Models;
using CandlestickAnalysis.Worker.Repositories;
using CandlestickAnalysis.Worker.Services;

namespace CandlestickAnalysis.Worker.Workers;

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

        // Report worker starting
        await ReportWorkerStartAsync();

        // Wait a bit for the database to be ready
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Update heartbeat
                    await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                        DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                    // Load schedule from database
                    using var scope = _serviceProvider.CreateScope();
                    var stockPriceRepository = scope.ServiceProvider.GetRequiredService<IStockPriceRepository>();

                    var schedule = await stockPriceRepository.GetScheduleByDataSourceNameAsync(DataSourceName);

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
                    var config = JsonSerializer.Deserialize<AnalysisConfig>(schedule.FetchConfig) ?? new AnalysisConfig();

                    // Calculate delay until next scheduled run
                    var delay = CalculateDelayUntilScheduledTime(schedule.ScheduleTimeUtc);

                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded. Next run at {ScheduleTime} UTC (in {Hours}h {Minutes}m)",
                        schedule.Name,
                        schedule.ScheduleTimeUtc,
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

                    // Record job execution start
                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    try
                    {
                        // Create new scope for the actual analysis operation
                        using var analysisScope = _serviceProvider.CreateScope();
                        var analysisService = analysisScope.ServiceProvider.GetRequiredService<ICandlestickAnalysisService>();
                        var priceRepo = analysisScope.ServiceProvider.GetRequiredService<IStockPriceRepository>();

                        // Determine the date to analyze
                        var analyzeDate = GetAnalyzeDate(config.AnalyzeDate);

                        _logger.LogInformation("Analyzing candlestick patterns for {Date}", analyzeDate);

                        // Run batch analysis
                        var result = await analysisService.AnalyzeAllStocksAsync(analyzeDate, stoppingToken);

                        // Update schedule status
                        var statusMessage = $"Analyzed {result.SuccessCount}/{result.TotalStocks} stocks, " +
                                          $"{result.PatternsDetected} patterns detected, " +
                                          $"Duration: {result.DurationSeconds:F1}s";

                        if (result.Errors.Count > 0)
                        {
                            statusMessage += $". Errors: {string.Join("; ", result.Errors.Take(3))}";
                        }

                        await priceRepo.UpdateScheduleStatusAsync(
                            schedule.Id,
                            result.Success ? "success" : "partial",
                            statusMessage);

                        // Record job execution success
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

                        // Update schedule with error status
                        using var errorScope = _serviceProvider.CreateScope();
                        var priceRepo = errorScope.ServiceProvider.GetRequiredService<IStockPriceRepository>();
                        await priceRepo.UpdateScheduleStatusAsync(schedule.Id, "failed", ex.Message);

                        // Record job execution failure
                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "failed" });
                    }

                    // Small delay before checking schedule again
                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in worker loop");
                    // Wait before retrying
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            // Report worker stopping
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
    /// </summary>
    private static TimeSpan CalculateDelayUntilScheduledTime(TimeSpan scheduleTimeUtc)
    {
        var now = DateTime.UtcNow;
        var todayScheduled = now.Date.Add(scheduleTimeUtc);

        // If the scheduled time has already passed today, schedule for tomorrow
        if (now >= todayScheduled)
        {
            todayScheduled = todayScheduled.AddDays(1);
        }

        return todayScheduled - now;
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
            _ => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)) // Default to yesterday
        };
    }
}

