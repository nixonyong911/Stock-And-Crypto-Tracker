using Dapper;
using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;

namespace DataFetcher.Worker.Workers.DataCompleteness;

public record IndicatorGap(
    int TickerId, string Symbol, string IndicatorName, string AssetType,
    DateOnly From, DateOnly To, int MissingDays);

public class DataCompletenessWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DataCompletenessWorker> _logger;

    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan CycleInterval = TimeSpan.FromHours(6);

    public DataCompletenessWorker(
        IServiceProvider serviceProvider,
        ILogger<DataCompletenessWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DataCompletenessWorker starting — initial delay {Delay}", InitialDelay);

        try
        {
            await Task.Delay(InitialDelay, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "DataCompletenessWorker cycle failed; retrying in {Interval}", CycleInterval);
            }

            try
            {
                await Task.Delay(CycleInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation("DataCompletenessWorker stopped");
    }

    private async Task RunCycleAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var registry = scope.ServiceProvider.GetRequiredService<IIndicatorRegistry>();
        var dbFactory = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        var stockTickerRepo = scope.ServiceProvider.GetRequiredService<IStockTickerRepository>();
        var cryptoTickerRepo = scope.ServiceProvider.GetRequiredService<ICryptoTickerRepository>();

        var definitions = registry.GetAllDefinitions();
        var stockTickers = (await stockTickerRepo.GetActiveTickersAsync()).ToList();
        var cryptoTickers = (await cryptoTickerRepo.GetActiveTickersAsync()).ToList();

        _logger.LogInformation(
            "Completeness scan: {DefCount} definitions, {StockCount} stocks, {CryptoCount} crypto",
            definitions.Count, stockTickers.Count, cryptoTickers.Count);

        var gaps = new List<IndicatorGap>();
        var healed = 0;

        foreach (var indicator in definitions)
        {
            if (indicator.AppliesTo("stock"))
            {
                foreach (var ticker in stockTickers)
                {
                    try
                    {
                        var gap = await DetectGapAsync(
                            dbFactory, indicator, ticker.Id, ticker.Symbol, "stock", ct);

                        if (gap is not null)
                        {
                            gaps.Add(gap);
                            await HealGapAsync(indicator, gap, ct);
                            healed++;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Gap detection/heal failed for {Indicator} stock {Symbol}",
                            indicator.IndicatorName, ticker.Symbol);
                    }
                }
            }

            if (indicator.AppliesTo("crypto"))
            {
                foreach (var ticker in cryptoTickers)
                {
                    try
                    {
                        var gap = await DetectGapAsync(
                            dbFactory, indicator, ticker.Id, ticker.Symbol, "crypto", ct);

                        if (gap is not null)
                        {
                            gaps.Add(gap);
                            await HealGapAsync(indicator, gap, ct);
                            healed++;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Gap detection/heal failed for {Indicator} crypto {Symbol}",
                            indicator.IndicatorName, ticker.Symbol);
                    }
                }
            }
        }

        _logger.LogInformation(
            "Completeness scan complete — {GapCount} gaps found, {Healed} heal attempts",
            gaps.Count, healed);
    }

    private async Task<IndicatorGap?> DetectGapAsync(
        IDbConnectionFactory dbFactory,
        IIndicatorDefinition indicator,
        int tickerId, string symbol, string assetType,
        CancellationToken ct)
    {
        using var conn = dbFactory.CreateConnection();

        var firstDateSql = assetType == "stock"
            ? "SELECT MIN(price_time)::date FROM stock_prices WHERE stock_ticker_id = @TickerId"
            : "SELECT MIN(price_time)::date FROM crypto_prices WHERE crypto_ticker_id = @TickerId";

        var firstDate = await conn.QuerySingleOrDefaultAsync<DateTime?>(firstDateSql, new { TickerId = tickerId });
        if (firstDate is null)
            return null;

        var from = DateOnly.FromDateTime(firstDate.Value);
        var to = DateOnly.FromDateTime(DateTime.UtcNow.Date);

        var expectedDays = CountExpectedTradingDays(indicator.CompletenessRule, from, to, symbol, assetType);
        if (expectedDays == 0)
            return null;

        var table = indicator.TargetTable(assetType);
        var idColumn = assetType == "stock" ? "stock_ticker_id" : "crypto_ticker_id";
        var actualSql = $"SELECT COUNT(DISTINCT indicator_time::date) FROM {table} WHERE {idColumn} = @TickerId";
        var actualDays = await conn.ExecuteScalarAsync<int>(actualSql, new { TickerId = tickerId });

        var missing = expectedDays - actualDays;
        if (missing <= 0)
            return null;

        var toleranceDays = Math.Max(3, (int)(expectedDays * 0.10));
        if (missing <= toleranceDays)
            return null;

        return new IndicatorGap(tickerId, symbol, indicator.IndicatorName, assetType, from, to, missing);
    }

    private async Task HealGapAsync(IIndicatorDefinition indicator, IndicatorGap gap, CancellationToken ct)
    {
        _logger.LogInformation(
            "Healing gap: {Indicator} {AssetType} {Symbol} — {Missing} missing days ({From} → {To})",
            gap.IndicatorName, gap.AssetType, gap.Symbol, gap.MissingDays, gap.From, gap.To);

        try
        {
            var result = await indicator.BackfillAsync(gap.TickerId, gap.Symbol, gap.From, gap.To, ct);

            if (result.Error is not null)
                _logger.LogWarning("Backfill partial error for {Indicator} {Symbol}: {Error}",
                    gap.IndicatorName, gap.Symbol, result.Error);
            else
                _logger.LogInformation("Backfill OK for {Indicator} {Symbol}: {Computed} computed, {Skipped} skipped",
                    gap.IndicatorName, gap.Symbol, result.DaysComputed, result.DaysSkipped);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Backfill failed for {Indicator} {Symbol}", gap.IndicatorName, gap.Symbol);
        }
    }

    private static int CountExpectedTradingDays(
        ICompletenessRule rule, DateOnly from, DateOnly to, string symbol, string assetType)
    {
        var count = 0;
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            if (!rule.IsExpectedGap(d, symbol, assetType))
                count++;
        }
        return count;
    }
}
