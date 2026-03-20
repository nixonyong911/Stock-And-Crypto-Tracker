using System.Data;
using System.Diagnostics;
using Dapper;
using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;

namespace DataFetcher.Worker.Workers.Scheduling;

public class DynamicIndicatorScheduler : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DynamicIndicatorScheduler> _logger;

    public DynamicIndicatorScheduler(
        IServiceProvider serviceProvider,
        ILogger<DynamicIndicatorScheduler> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DynamicIndicatorScheduler starting");
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        try
        {
            List<string> scheduleNames;

            using (var scope = _serviceProvider.CreateScope())
            {
                var registry = scope.ServiceProvider.GetRequiredService<IIndicatorRegistry>();
                scheduleNames = registry.GetAllDefinitions()
                    .Select(d => d.GetScheduleConfig().ScheduleName)
                    .Distinct()
                    .ToList();
            }

            if (scheduleNames.Count == 0)
            {
                _logger.LogWarning("No indicator definitions registered. DynamicIndicatorScheduler exiting.");
                return;
            }

            _logger.LogInformation(
                "Launching {GroupCount} schedule groups: {Names}",
                scheduleNames.Count, string.Join(", ", scheduleNames));

            var tasks = scheduleNames.Select(name =>
                RunScheduleGroupAsync(name, stoppingToken));

            await Task.WhenAll(tasks);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DynamicIndicatorScheduler fatal error");
        }

        _logger.LogInformation("DynamicIndicatorScheduler stopped");
    }

    private async Task RunScheduleGroupAsync(string scheduleName, CancellationToken ct)
    {
        _logger.LogInformation("Schedule group '{Name}' started", scheduleName);

        try
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                    var schedule = await scheduleRepo.GetScheduleByNameAsync(scheduleName);
                    if (schedule == null || !schedule.IsEnabled)
                    {
                        _logger.LogWarning(
                            "No enabled schedule '{Name}'. Retrying in 1 hour.", scheduleName);
                        await Task.Delay(TimeSpan.FromHours(1), ct);
                        continue;
                    }

                    var (delay, nextRunUtc) = schedule.IntervalMinutes.HasValue
                        ? IntervalScheduleHelper.CalculateDelayUntilNextInterval(
                            schedule.IntervalMinutes.Value, schedule.OffsetMinutes)
                        : IntervalScheduleHelper.CalculateDelayUntilScheduledTime(
                            schedule.ScheduleTime, schedule.ScheduleTimezone);

                    _logger.LogInformation(
                        "Schedule '{Name}' next run ~{NextRun} UTC (delay {Delay})",
                        scheduleName, nextRunUtc.ToString("HH:mm"), delay);

                    try
                    {
                        await Task.Delay(delay, ct);
                    }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested)
                    {
                        break;
                    }

                    var stockPipelineSchedule = await scheduleRepo.GetScheduleByNameAsync("pipeline-orchestrator-stock");
                    var cryptoPipelineSchedule = await scheduleRepo.GetScheduleByNameAsync("pipeline-orchestrator-crypto");
                    var intervalMinutes = schedule.IntervalMinutes ?? 30;
                    var threshold = TimeSpan.FromMinutes(intervalMinutes);

                    var stockRanRecently = stockPipelineSchedule?.LastRunAt != null &&
                        DateTime.UtcNow - stockPipelineSchedule.LastRunAt.Value < threshold;
                    var cryptoRanRecently = cryptoPipelineSchedule?.LastRunAt != null &&
                        DateTime.UtcNow - cryptoPipelineSchedule.LastRunAt.Value < threshold;

                    if (stockRanRecently || cryptoRanRecently)
                    {
                        _logger.LogInformation(
                            "Skipping timer-triggered indicator schedule '{Name}' — pipeline orchestrator already ran this cycle",
                            scheduleName);
                        continue;
                    }

                    var sw = Stopwatch.StartNew();
                    var startedAt = DateTime.UtcNow;
                    var status = "unknown";
                    string? message = null;

                    try
                    {
                        await ExecuteScheduleGroupAsync(scheduleName, ct);
                        status = "completed";
                    }
                    catch (Exception ex)
                    {
                        status = "failed";
                        message = ex.Message;
                        throw;
                    }
                    finally
                    {
                        sw.Stop();
                        try
                        {
                            using var logScope = _serviceProvider.CreateScope();
                            var logRepo = logScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                            var sched = await logRepo.GetScheduleByNameAsync(scheduleName);
                            if (sched != null)
                            {
                                await logRepo.UpdateLastRunAsync(sched.Id, status, message);
                                await logRepo.LogExecutionAsync(
                                    sched.Id, status, message, (int)sw.ElapsedMilliseconds, startedAt);
                            }
                        }
                        catch (Exception logEx)
                        {
                            _logger.LogWarning(logEx,
                                "Failed to log execution for schedule '{Name}'", scheduleName);
                        }
                    }
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Error in schedule group '{Name}'. Retrying in 5 min.", scheduleName);
                    await Task.Delay(TimeSpan.FromMinutes(5), ct);
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Normal shutdown
        }
    }

    private async Task ExecuteScheduleGroupAsync(string scheduleName, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var registry = scope.ServiceProvider.GetRequiredService<IIndicatorRegistry>();
        var stockRepo = scope.ServiceProvider.GetRequiredService<IStockTickerRepository>();
        var cryptoRepo = scope.ServiceProvider.GetRequiredService<ICryptoTickerRepository>();

        var indicators = registry.GetAllDefinitions()
            .Where(d => d.GetScheduleConfig().ScheduleName == scheduleName)
            .ToList();

        if (indicators.Count == 0)
        {
            _logger.LogWarning("No indicators for schedule '{Name}' in this cycle", scheduleName);
            return;
        }

        var stockTickers = (await stockRepo.GetActiveTickersAsync()).ToList();
        var cryptoTickers = (await cryptoRepo.GetActiveTickersAsync()).ToList();

        var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var to = DateOnly.FromDateTime(DateTime.UtcNow);

        var noDeps = indicators.Where(i => i.GetScheduleConfig().DependsOn.Length == 0).ToList();
        var withDeps = indicators.Where(i => i.GetScheduleConfig().DependsOn.Length > 0).ToList();

        if (noDeps.Count > 0)
        {
            _logger.LogInformation(
                "Phase 1 — {Count} indicators with no deps: {Names}",
                noDeps.Count, string.Join(", ", noDeps.Select(i => i.IndicatorName)));
            await RunIndicatorBatchAsync(noDeps, stockTickers, cryptoTickers, from, to, ct);
        }

        if (withDeps.Count > 0)
        {
            _logger.LogInformation(
                "Phase 2 — {Count} indicators with deps: {Names}",
                withDeps.Count, string.Join(", ", withDeps.Select(i => i.IndicatorName)));
            await RunIndicatorBatchAsync(withDeps, stockTickers, cryptoTickers, from, to, ct);
        }
    }

    private async Task RunIndicatorBatchAsync(
        List<IIndicatorDefinition> indicators,
        List<StockTicker> stockTickers,
        List<CryptoTicker> cryptoTickers,
        DateOnly from, DateOnly to,
        CancellationToken ct)
    {
        var tasks = indicators.Select(async indicator =>
        {
            try
            {
                bool isFresh;
                using (var checkScope = _serviceProvider.CreateScope())
                {
                    var connFactory = checkScope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
                    using var conn = connFactory.CreateConnection();
                    isFresh = await IsDependencyDataFreshAsync(indicator, conn, ct);
                }

                if (!isFresh)
                {
                    _logger.LogWarning(
                        "Skipping {Name}: dependency data is stale", indicator.IndicatorName);
                    return;
                }

                _logger.LogInformation("Executing indicator {Name}", indicator.IndicatorName);

                if (indicator.Category == IndicatorCategory.Basic)
                {
                    if (indicator.AppliesTo("stock") && stockTickers.Count > 0)
                        await indicator.BackfillAsync(stockTickers[0].Id, stockTickers[0].Symbol, from, to, ct);
                    if (indicator.AppliesTo("crypto") && cryptoTickers.Count > 0)
                        await indicator.BackfillAsync(cryptoTickers[0].Id, cryptoTickers[0].Symbol, from, to, ct);
                }
                else
                {
                    if (indicator.AppliesTo("stock"))
                    {
                        foreach (var ticker in stockTickers)
                        {
                            ct.ThrowIfCancellationRequested();
                            await indicator.BackfillAsync(ticker.Id, ticker.Symbol, from, to, ct);
                        }
                    }

                    if (indicator.AppliesTo("crypto"))
                    {
                        foreach (var ticker in cryptoTickers)
                        {
                            ct.ThrowIfCancellationRequested();
                            await indicator.BackfillAsync(ticker.Id, ticker.Symbol, from, to, ct);
                        }
                    }
                }

                _logger.LogInformation("Indicator {Name} completed", indicator.IndicatorName);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Indicator {Name} execution failed (isolated)", indicator.IndicatorName);
            }
        });

        await Task.WhenAll(tasks);
    }

    private async Task<bool> IsDependencyDataFreshAsync(
        IIndicatorDefinition indicator, IDbConnection conn, CancellationToken ct)
    {
        foreach (var depTable in indicator.DependsOnTables)
        {
            if (string.IsNullOrEmpty(depTable)) continue;

            var timeCol = depTable.EndsWith("_prices") ? "price_time" : "indicator_time";
            var latestTime = await conn.QueryFirstOrDefaultAsync<DateTime?>(
                new CommandDefinition(
                    $"SELECT MAX({timeCol}) FROM {depTable}",
                    cancellationToken: ct));

            if (latestTime == null) return false;

            var staleness = DateTime.UtcNow - latestTime.Value;
            var maxStaleness = indicator.GetScheduleConfig().Interval * 2;

            if (staleness > maxStaleness) return false;
        }
        return true;
    }
}
