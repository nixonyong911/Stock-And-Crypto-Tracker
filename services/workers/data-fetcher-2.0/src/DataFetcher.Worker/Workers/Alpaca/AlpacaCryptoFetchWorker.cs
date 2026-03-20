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

public class AlpacaCryptoFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaCryptoFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IGatewayAlertNotifier _alertNotifier;
    private readonly IPipelineEventPublisher _pipelinePublisher;
    private DateTime? _lastFetchTime;

    private static readonly TimeZoneInfo EasternTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public AlpacaCryptoFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaCryptoFetchWorker> logger,
        IMetricsClient metrics,
        IGatewayAlertNotifier alertNotifier,
        IPipelineEventPublisher pipelinePublisher)
    {
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
        _alertNotifier = alertNotifier;
        _pipelinePublisher = pipelinePublisher;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Alpaca Crypto Fetch Worker starting (30-min interval, 24/5)");
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var nowEt = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz);

                if (nowEt.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
                {
                    var nextMonday = nowEt.Date.AddDays(nowEt.DayOfWeek == DayOfWeek.Saturday ? 2 : 1)
                        .Add(TimeSpan.FromHours(4));
                    var sleepUntil = TimeZoneInfo.ConvertTimeToUtc(nextMonday, EasternTz) - DateTime.UtcNow;
                    if (sleepUntil > TimeSpan.Zero)
                    {
                        _logger.LogInformation("Weekend detected. Crypto worker sleeping until Monday ({Duration})", sleepUntil);
                        await Task.Delay(sleepUntil, stoppingToken);
                    }
                    continue;
                }

                using var scope = _serviceProvider.CreateScope();
                var fetchService = scope.ServiceProvider.GetRequiredService<IAlpacaCryptoFetchService>();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    var records = await fetchService.FetchLatestCryptoDataAsync(_lastFetchTime, stoppingToken);
                    _lastFetchTime = DateTime.UtcNow;

                    var etoroRecords = await TryEtoroFailoverForStaleCryptoAsync(scope, stoppingToken);
                    var total = records + etoroRecords;

                    message = etoroRecords > 0
                        ? $"Fetched {records} Alpaca + {etoroRecords} eToro failover crypto records"
                        : $"Fetched {records} crypto records";
                    _logger.LogInformation("{Message}", message);

                    await _metrics.IncrementCounterAsync("alpaca_crypto_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "success" });

                    _pipelinePublisher.PublishOhlcvComplete("crypto", records + etoroRecords, records + etoroRecords);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during crypto fetch");

                    await _metrics.IncrementCounterAsync("alpaca_crypto_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "error" });
                }

                var schedule = await scheduleRepo.GetScheduleByNameAsync("Alpaca Crypto Fetch");
                if (schedule != null)
                {
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in Alpaca Crypto Fetch Worker");
            }

            await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
        }

        _logger.LogInformation("Alpaca Crypto Fetch Worker stopped");
    }

    /// <summary>
    /// After the primary Alpaca fetch, find crypto tickers that have an eToro instrumentId
    /// but received no data from Alpaca in the last 2 hours, and fetch from eToro as fallback.
    /// </summary>
    private async Task<int> TryEtoroFailoverForStaleCryptoAsync(IServiceScope scope, CancellationToken ct)
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
                SELECT ct.id, ct.symbol, ct.etoro_instrument_id
                FROM crypto_tickers ct
                WHERE ct.is_active = true
                  AND ct.etoro_instrument_id IS NOT NULL
                  AND ct.preferred_data_source_id = @AlpacaDsId
                  AND NOT EXISTS (
                    SELECT 1 FROM crypto_prices cp
                    WHERE cp.crypto_ticker_id = ct.id AND cp.price_time > @Since
                  )",
                new { AlpacaDsId = alpacaDataSourceId, Since = DateTime.UtcNow.AddHours(-2) })).ToList();

            if (staleTickers.Count == 0) return 0;

            _logger.LogInformation("eToro crypto failover: {Count} stale tickers to fetch", staleTickers.Count);

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
                        AssetType = "crypto",
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
                        parameters.Add($"vol{j}", result.Bars[j].Volume);
                    }

                    await connection.ExecuteAsync($@"
                        INSERT INTO crypto_prices (crypto_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
                        VALUES {sb}
                        ON CONFLICT (crypto_ticker_id, data_source_id, price_time)
                        DO UPDATE SET open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price,
                                      low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price, volume = EXCLUDED.volume",
                        parameters);

                    _logger.LogInformation("eToro crypto failover: saved {Count} bars for {Symbol}", result.Bars.Count, ticker.Symbol);
                    totalRecords += result.Bars.Count;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "eToro crypto failover failed for {Symbol} (non-fatal)", ticker.Symbol);
                }

                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }

            return totalRecords;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "eToro crypto failover step failed (non-fatal)");
            return 0;
        }
    }
}
