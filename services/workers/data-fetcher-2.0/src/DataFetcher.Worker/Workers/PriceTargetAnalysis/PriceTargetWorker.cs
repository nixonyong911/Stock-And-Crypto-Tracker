using System.Text.Json;
using DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.PriceTargetAnalysis;

public class PriceTargetWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PriceTargetWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "PriceTargetAnalysis";
    private const string WorkerVersion = "1.0.0";

    public PriceTargetWorker(
        IServiceProvider serviceProvider,
        ILogger<PriceTargetWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Price Target Worker starting");
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
                        _logger.LogWarning("No enabled schedule found for '{DataSource}'. Retrying in 1 hour.", DataSourceName);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    if (!schedule.IsEnabled)
                    {
                        _logger.LogInformation("Schedule '{Name}' is disabled. Checking again in 1 hour.", schedule.Name);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    var config = !string.IsNullOrEmpty(schedule.FetchConfig)
                        ? JsonSerializer.Deserialize<PriceTargetConfig>(schedule.FetchConfig) ?? new PriceTargetConfig()
                        : new PriceTargetConfig();

                    var (delay, nextRunUtc) = CalculateDelayUntilScheduledTime(schedule.ScheduleTime, schedule.ScheduleTimezone);

                    _logger.LogInformation(
                        "Schedule '{Name}' loaded. Next run at {Time} {Tz} ({Utc} UTC, in {H}h {M}m)",
                        schedule.Name, schedule.ScheduleTime, schedule.ScheduleTimezone,
                        nextRunUtc.ToString("HH:mm"), (int)delay.TotalHours, delay.Minutes);

                    try
                    {
                        await Task.Delay(delay, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }

                    _logger.LogInformation("Starting scheduled price target calculation at {Time} UTC", DateTime.UtcNow);
                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started", ["worker"] = "price-target" });

                    try
                    {
                        using var analysisScope = _serviceProvider.CreateScope();
                        var stockService = analysisScope.ServiceProvider.GetRequiredService<IPriceTargetService>();
                        var cryptoService = analysisScope.ServiceProvider.GetRequiredService<ICryptoPriceTargetService>();
                        var fetchScheduleRepo = analysisScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                        var analyzeDate = GetAnalyzeDate(config.AnalyzeDate);
                        var statusParts = new List<string>();

                        var isWeekday = analyzeDate.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday);
                        if (isWeekday)
                        {
                            var stockResult = await stockService.CalculateAllStocksAsync(analyzeDate, stoppingToken);
                            statusParts.Add($"Stocks: {stockResult.SuccessCount}/{stockResult.TotalStocks} ({stockResult.SkippedCount} skipped, {stockResult.DurationSeconds:F1}s)");
                            if (stockResult.Errors.Count > 0)
                                statusParts.Add($"Stock errors: {string.Join("; ", stockResult.Errors.Take(3))}");
                        }
                        else
                        {
                            statusParts.Add("Stocks: skipped (weekend)");
                        }

                        var cryptoResult = await cryptoService.CalculateAllCryptoAsync(analyzeDate, stoppingToken);
                        statusParts.Add($"Crypto: {cryptoResult.SuccessCount}/{cryptoResult.TotalStocks} ({cryptoResult.SkippedCount} skipped, {cryptoResult.DurationSeconds:F1}s)");
                        if (cryptoResult.Errors.Count > 0)
                            statusParts.Add($"Crypto errors: {string.Join("; ", cryptoResult.Errors.Take(3))}");

                        var priceTargetRepo = analysisScope.ServiceProvider.GetRequiredService<IPriceTargetRepository>();
                        var deleted = await priceTargetRepo.DeleteOlderThanAsync(90);
                        if (deleted > 0)
                            statusParts.Add($"Cleanup: {deleted} old rows removed");

                        var statusMessage = string.Join(" | ", statusParts);
                        var overallSuccess = isWeekday
                            ? cryptoResult.Success
                            : cryptoResult.Success;

                        await fetchScheduleRepo.UpdateLastRunAsync(
                            schedule.Id,
                            overallSuccess ? "success" : "partial",
                            statusMessage);

                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "completed", ["worker"] = "price-target" });
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error during price target calculation");
                        using var errorScope = _serviceProvider.CreateScope();
                        var fetchScheduleRepo = errorScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                        await fetchScheduleRepo.UpdateLastRunAsync(schedule.Id, "failed", ex.Message);

                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "failed", ["worker"] = "price-target" });
                    }

                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in price target worker loop");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
        }

        _logger.LogInformation("Price Target Worker stopped");
    }

    private async Task ReportWorkerStartAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync("worker_up", 1);
            await _metrics.SetGaugeAsync("worker_info", 1,
                new Dictionary<string, string> { ["version"] = WorkerVersion, ["worker_name"] = "price-target" });
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

    private static (TimeSpan delay, DateTime nextRunUtc) CalculateDelayUntilScheduledTime(TimeSpan scheduleTime, string scheduleTimezone)
    {
        var now = DateTime.UtcNow;
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(scheduleTimezone); }
        catch (TimeZoneNotFoundException) { tz = TimeZoneInfo.Utc; }

        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(now, tz);
        var todayScheduledInTz = nowInTz.Date.Add(scheduleTime);

        if (nowInTz >= todayScheduledInTz)
            todayScheduledInTz = todayScheduledInTz.AddDays(1);

        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(todayScheduledInTz, tz);
        return (scheduledUtc - now, scheduledUtc);
    }

    private static DateOnly GetAnalyzeDate(string config)
    {
        return config.ToLower() switch
        {
            "yesterday" => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)),
            "today" => DateOnly.FromDateTime(DateTime.UtcNow),
            _ => DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1))
        };
    }
}
