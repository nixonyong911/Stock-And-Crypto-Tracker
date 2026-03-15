using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Alpaca;

public class AlpacaStockFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaStockFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IGatewayAlertNotifier _alertNotifier;
    private DateTime? _lastFetchTime;

    public AlpacaStockFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaStockFetchWorker> logger,
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
        _logger.LogInformation("Alpaca Stock Fetch Worker starting (30-min interval, 24/7 — Alpaca returns empty on non-trading days)");
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var fetchService = scope.ServiceProvider.GetRequiredService<IAlpacaStockFetchService>();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    var records = await fetchService.FetchLatestStockDataAsync(_lastFetchTime, stoppingToken);
                    _lastFetchTime = DateTime.UtcNow;

                    var etoroRecords = await TryEtoroFailoverForStaleStocksAsync(scope, stoppingToken);
                    var total = records + etoroRecords;

                    message = etoroRecords > 0
                        ? $"Fetched {records} Alpaca + {etoroRecords} eToro failover stock records"
                        : $"Fetched {records} stock records";
                    _logger.LogInformation("{Message}", message);

                    await _metrics.IncrementCounterAsync("alpaca_stock_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "success" });

                    _ = _alertNotifier.NotifyAsync("stock", stoppingToken);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during stock fetch");

                    await _metrics.IncrementCounterAsync("alpaca_stock_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "error" });
                }

                var schedule = await scheduleRepo.GetScheduleByNameAsync("Alpaca Stock Fetch");
                if (schedule != null)
                {
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in Alpaca Stock Fetch Worker");
            }

            await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
        }

        _logger.LogInformation("Alpaca Stock Fetch Worker stopped");
    }

    /// <summary>
    /// After the primary Alpaca fetch, find Alpaca-primary stock tickers that have an eToro
    /// instrumentId but received no data from Alpaca in the last 2 hours, and fetch from eToro.
    /// </summary>
    private async Task<int> TryEtoroFailoverForStaleStocksAsync(IServiceScope scope, CancellationToken ct)
    {
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
            var etoroProvider = scope.ServiceProvider.GetRequiredService<EtoroMarketDataProvider>();

            using var connection = db.CreateConnection();

            var etoroDataSourceId = await connection.QueryFirstOrDefaultAsync<int>(
                "SELECT id FROM lookup_data_sources WHERE name = 'eToro' AND is_active = true");
            if (etoroDataSourceId == 0) return 0;

            var alpacaDataSourceId = await connection.QueryFirstOrDefaultAsync<int>(
                "SELECT id FROM lookup_data_sources WHERE name = 'Alpaca' AND is_active = true");

            var staleTickers = (await connection.QueryAsync<(int Id, string Symbol, int EtoroInstrumentId)>(@"
                SELECT st.id, st.symbol, st.etoro_instrument_id
                FROM stock_tickers st
                WHERE st.is_active = true
                  AND st.etoro_instrument_id IS NOT NULL
                  AND st.preferred_data_source_id = @AlpacaDsId
                  AND NOT EXISTS (
                    SELECT 1 FROM stock_prices sp
                    WHERE sp.stock_ticker_id = st.id AND sp.price_time > @Since
                  )",
                new { AlpacaDsId = alpacaDataSourceId, Since = DateTime.UtcNow.AddHours(-2) })).ToList();

            if (staleTickers.Count == 0) return 0;

            _logger.LogInformation("eToro stock failover: {Count} stale tickers to fetch", staleTickers.Count);

            var totalRecords = 0;
            foreach (var ticker in staleTickers)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var result = await etoroProvider.FetchBarsAsync(new BarFetchRequest
                    {
                        InstrumentId = ticker.EtoroInstrumentId,
                        Symbol = ticker.Symbol,
                        AssetType = "stock",
                        Count = 100,
                        Interval = "FifteenMinutes"
                    }, ct);

                    if (!result.Success || result.Bars.Count == 0) continue;

                    var sb = new StringBuilder();
                    var parameters = new DynamicParameters();
                    for (var j = 0; j < result.Bars.Count; j++)
                    {
                        if (j > 0) sb.Append(", ");
                        sb.Append($"(@tid{j}, @dsid{j}, @pt{j}, @op{j}, @hp{j}, @lp{j}, @cp{j}, @vol{j})");
                        parameters.Add($"tid{j}", ticker.Id);
                        parameters.Add($"dsid{j}", etoroDataSourceId);
                        parameters.Add($"pt{j}", result.Bars[j].Timestamp);
                        parameters.Add($"op{j}", result.Bars[j].Open);
                        parameters.Add($"hp{j}", result.Bars[j].High);
                        parameters.Add($"lp{j}", result.Bars[j].Low);
                        parameters.Add($"cp{j}", result.Bars[j].Close);
                        parameters.Add($"vol{j}", (long)result.Bars[j].Volume);
                    }

                    await connection.ExecuteAsync($@"
                        INSERT INTO stock_prices (stock_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
                        VALUES {sb}
                        ON CONFLICT (stock_ticker_id, data_source_id, price_time)
                        DO UPDATE SET open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price,
                                      low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price, volume = EXCLUDED.volume",
                        parameters);

                    _logger.LogInformation("eToro stock failover: saved {Count} bars for {Symbol}", result.Bars.Count, ticker.Symbol);
                    totalRecords += result.Bars.Count;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "eToro stock failover failed for {Symbol} (non-fatal)", ticker.Symbol);
                }

                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }

            return totalRecords;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "eToro stock failover step failed (non-fatal)");
            return 0;
        }
    }
}
