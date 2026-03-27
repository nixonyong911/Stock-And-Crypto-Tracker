using System.Text.Json;
using DataFetcher.Worker.Application.Providers.MarketAuxNews;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.MarketAuxNews;

public class MarketAuxNewsWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MarketAuxNewsWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "MarketAux";
    private const string WorkerVersion = "1.1.0";
    private const string MetricsPrefix = "data_fetcher_2_marketaux_news";
    private const int DefaultDailyBudget = 100;
    private const int DefaultCycleBudget = 25;

    public MarketAuxNewsWorker(
        IServiceProvider serviceProvider,
        ILogger<MarketAuxNewsWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MarketAux News Worker starting (v{Version})", WorkerVersion);
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
                    var schedule = await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                    if (schedule == null || !schedule.IsEnabled)
                    {
                        _logger.LogWarning("No enabled schedule found for {DataSource}, waiting 1 hour", DataSourceName);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    var (delay, nextRunUtc) = schedule.IntervalMinutes.HasValue
                        ? IntervalScheduleHelper.CalculateDelayUntilNextInterval(schedule.IntervalMinutes.Value, schedule.OffsetMinutes)
                        : IntervalScheduleHelper.CalculateDelayUntilScheduledTime(schedule.ScheduleTime, schedule.ScheduleTimezone);

                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded ({Mode}). Next run at {NextRunUtc} UTC, in {Hours}h {Minutes}m",
                        schedule.Name,
                        schedule.IntervalMinutes.HasValue ? $"every {schedule.IntervalMinutes}min, offset={schedule.OffsetMinutes}" : "daily",
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

                    var config = ParseFetchConfig(schedule.FetchConfig);
                    var todayUtc = DateTime.UtcNow.ToString("yyyy-MM-dd");

                    if (config.CounterDate != todayUtc)
                    {
                        config.RequestsToday = 0;
                        config.CounterDate = todayUtc;
                    }

                    var dailyBudget = config.DailyRequestBudget > 0 ? config.DailyRequestBudget : DefaultDailyBudget;
                    var cycleBudget = config.CycleBudget > 0 ? config.CycleBudget : DefaultCycleBudget;
                    var remainingDaily = dailyBudget - config.RequestsToday;
                    var effectiveCycleBudget = Math.Min(cycleBudget, remainingDaily);
                    var startedAt = DateTime.UtcNow;

                    if (remainingDaily <= 0)
                    {
                        _logger.LogWarning("Daily request budget exhausted ({Used}/{Budget}). Skipping cycle.",
                            config.RequestsToday, dailyBudget);
                        await scheduleRepo.UpdateLastRunAsync(schedule.Id, "skipped", $"Budget exhausted: {config.RequestsToday}/{dailyBudget}");
                        await scheduleRepo.LogExecutionAsync(schedule.Id, "skipped", $"Budget exhausted: {config.RequestsToday}/{dailyBudget}", 0, startedAt);
                        continue;
                    }

                    _logger.LogInformation(
                        "Starting MarketAux news fetch (cycle budget: {CycleBudget}, daily: {Used}/{DailyBudget})",
                        effectiveCycleBudget, config.RequestsToday, dailyBudget);

                    try
                    {
                        using var fetchScope = _serviceProvider.CreateScope();
                        var fetchService = fetchScope.ServiceProvider.GetRequiredService<IMarketAuxNewsFetchService>();
                        var newsRepo = fetchScope.ServiceProvider.GetRequiredService<INewsArticleRepository>();
                        var fetchScheduleRepo = fetchScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                        var result = await fetchService.FetchAndStoreNewsAsync(effectiveCycleBudget, stoppingToken);

                        config.RequestsToday += result.RequestsMade;
                        await UpdateFetchConfigAsync(fetchScheduleRepo, schedule.Id, config);

                        if (config.RequestsToday == result.RequestsMade)
                        {
                            result.CleanedUp = await newsRepo.CleanupOldArticlesAsync(30);
                        }

                        var statusMessage = $"Fetched {result.ArticlesFetched}, stored {result.ArticlesStored}, " +
                                          $"requests {result.RequestsMade}/{effectiveCycleBudget} (today: {config.RequestsToday}/{dailyBudget})";
                        if (result.CleanedUp > 0) statusMessage += $", cleaned {result.CleanedUp}";
                        if (result.Errors.Count > 0) statusMessage += $", errors: {string.Join("; ", result.Errors.Take(3))}";

                        var status = result.Errors.Count == 0 ? "success" : "partial";
                        await fetchScheduleRepo.UpdateLastRunAsync(schedule.Id, status, statusMessage);
                        await fetchScheduleRepo.LogExecutionAsync(schedule.Id, status, statusMessage, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);

                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = status });
                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_articles_stored_total", result.ArticlesStored);

                        _logger.LogInformation("MarketAux news fetch complete: {Status}", statusMessage);

                        if (status == "success")
                        {
                            var gatewayNotifier = fetchScope.ServiceProvider.GetRequiredService<IGatewayAlertNotifier>();
                            await gatewayNotifier.NotifyProcessNewsAsync(stoppingToken);
                        }
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error during MarketAux news fetch");

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
                    _logger.LogError(ex, "Unexpected error in MarketAux news worker loop");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
            _logger.LogInformation("MarketAux News Worker stopped");
        }
    }

    internal static MarketAuxFetchConfig ParseFetchConfig(string? json)
    {
        if (string.IsNullOrEmpty(json)) return new MarketAuxFetchConfig();
        try
        {
            return JsonSerializer.Deserialize<MarketAuxFetchConfig>(json) ?? new MarketAuxFetchConfig();
        }
        catch
        {
            return new MarketAuxFetchConfig();
        }
    }

    private static async Task UpdateFetchConfigAsync(IFetchScheduleRepository repo, int scheduleId, MarketAuxFetchConfig config)
    {
        var configJson = JsonSerializer.Serialize(config);
        await repo.UpdateFetchConfigAsync(scheduleId, configJson);
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
                    ["worker_name"] = "marketaux-news",
                    ["service"] = "data-fetcher-2.0"
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

public class MarketAuxFetchConfig
{
    public int DailyRequestBudget { get; set; } = 100;
    public int CycleBudget { get; set; } = 25;
    public int RequestsToday { get; set; }
    public string CounterDate { get; set; } = "";
    public List<string> Queries { get; set; } = new() { "macro", "geopolitical", "policy", "market" };
}
