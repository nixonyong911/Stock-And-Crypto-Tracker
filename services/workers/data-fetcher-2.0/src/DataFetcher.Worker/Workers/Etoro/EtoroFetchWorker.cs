using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Etoro;

public class EtoroFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly EtoroSettings _settings;
    private readonly ILogger<EtoroFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IGatewayAlertNotifier _alertNotifier;

    public EtoroFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<EtoroSettings> settings,
        ILogger<EtoroFetchWorker> logger,
        IMetricsClient metrics,
        IGatewayAlertNotifier alertNotifier)
    {
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
        _alertNotifier = alertNotifier;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("eToro Fetch Worker starting ({Interval}-min interval)", _settings.FetchIntervalMinutes);
        await Task.Delay(TimeSpan.FromSeconds(25), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    var records = await FetchEtoroTickersAsync(stoppingToken);
                    message = $"Fetched {records} eToro records";
                    _logger.LogInformation("{Message}", message);

                    await _metrics.IncrementCounterAsync("etoro_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "success" });

                    if (records > 0)
                    {
                        _ = _alertNotifier.NotifyAsync("stock", stoppingToken);
                        _ = _alertNotifier.NotifyAsync("crypto", stoppingToken);
                    }
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during eToro fetch");

                    await _metrics.IncrementCounterAsync("etoro_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "error" });
                }

                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var schedule = await scheduleRepo.GetScheduleByNameAsync("eToro Asset Fetch");
                if (schedule != null)
                {
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in eToro Fetch Worker");
            }

            await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
        }

        _logger.LogInformation("eToro Fetch Worker stopped");
    }

    private async Task<int> FetchEtoroTickersAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
        var etoroProvider = scope.ServiceProvider.GetRequiredService<EtoroMarketDataProvider>();

        using var connection = db.CreateConnection();

        var etoroDataSourceId = await connection.QueryFirstOrDefaultAsync<int>(
            "SELECT id FROM lookup_data_sources WHERE name = 'eToro' AND is_active = true");

        if (etoroDataSourceId == 0)
        {
            _logger.LogWarning("eToro data source not found, skipping fetch");
            return 0;
        }

        var stockTickers = (await connection.QueryAsync<(int Id, string Symbol, int EtoroInstrumentId)>(
            @"SELECT id, symbol, etoro_instrument_id FROM stock_tickers
              WHERE is_active = true AND preferred_data_source_id = @DsId AND etoro_instrument_id IS NOT NULL",
            new { DsId = etoroDataSourceId })).ToList();

        var cryptoTickers = (await connection.QueryAsync<(int Id, string Symbol, int EtoroInstrumentId)>(
            @"SELECT id, symbol, etoro_instrument_id FROM crypto_tickers
              WHERE is_active = true AND preferred_data_source_id = @DsId AND etoro_instrument_id IS NOT NULL",
            new { DsId = etoroDataSourceId })).ToList();

        _logger.LogInformation("eToro fetch: {StockCount} stocks, {CryptoCount} crypto tickers",
            stockTickers.Count, cryptoTickers.Count);

        var totalRecords = 0;

        foreach (var ticker in stockTickers)
        {
            ct.ThrowIfCancellationRequested();
            var count = await FetchAndSaveAsync(etoroProvider, connection, ticker.Id, ticker.Symbol, ticker.EtoroInstrumentId,
                "stock", etoroDataSourceId, isStock: true, ct);
            totalRecords += count;
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }

        foreach (var ticker in cryptoTickers)
        {
            ct.ThrowIfCancellationRequested();
            var count = await FetchAndSaveAsync(etoroProvider, connection, ticker.Id, ticker.Symbol, ticker.EtoroInstrumentId,
                "crypto", etoroDataSourceId, isStock: false, ct);
            totalRecords += count;
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }

        return totalRecords;
    }

    private async Task<int> FetchAndSaveAsync(
        EtoroMarketDataProvider provider,
        System.Data.IDbConnection connection,
        int tickerId, string symbol, int instrumentId,
        string assetType, int dataSourceId, bool isStock,
        CancellationToken ct)
    {
        try
        {
            var result = await provider.FetchBarsAsync(new BarFetchRequest
            {
                InstrumentId = instrumentId,
                Symbol = symbol,
                AssetType = assetType,
                Count = 100,
                Interval = "FifteenMinutes"
            }, ct);

            if (!result.Success || result.Bars.Count == 0)
            {
                _logger.LogDebug("No bars from eToro for {Symbol} (instrument {Id})", symbol, instrumentId);
                return 0;
            }

            var sb = new StringBuilder();
            var parameters = new DynamicParameters();

            for (var j = 0; j < result.Bars.Count; j++)
            {
                if (j > 0) sb.Append(", ");
                sb.Append($"(@tid{j}, @dsid{j}, @pt{j}, @op{j}, @hp{j}, @lp{j}, @cp{j}, @vol{j})");
                parameters.Add($"tid{j}", tickerId);
                parameters.Add($"dsid{j}", dataSourceId);
                parameters.Add($"pt{j}", result.Bars[j].Timestamp);
                parameters.Add($"op{j}", result.Bars[j].Open);
                parameters.Add($"hp{j}", result.Bars[j].High);
                parameters.Add($"lp{j}", result.Bars[j].Low);
                parameters.Add($"cp{j}", result.Bars[j].Close);
                parameters.Add($"vol{j}", isStock ? (long)result.Bars[j].Volume : result.Bars[j].Volume);
            }

            var table = isStock ? "stock_prices" : "crypto_prices";
            var tickerCol = isStock ? "stock_ticker_id" : "crypto_ticker_id";
            var sql = $@"
                INSERT INTO {table} ({tickerCol}, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
                VALUES {sb}
                ON CONFLICT ({tickerCol}, data_source_id, price_time)
                DO UPDATE SET open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price,
                              low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price, volume = EXCLUDED.volume";

            await connection.ExecuteAsync(sql, parameters);
            _logger.LogDebug("eToro: saved {Count} bars for {Symbol}", result.Bars.Count, symbol);
            return result.Bars.Count;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch/save eToro data for {Symbol}", symbol);
            return 0;
        }
    }
}
