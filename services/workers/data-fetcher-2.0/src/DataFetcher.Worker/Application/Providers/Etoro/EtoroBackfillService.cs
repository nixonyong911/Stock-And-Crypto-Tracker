using System.Diagnostics;
using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Application.Providers.Etoro;

public interface IEtoroBackfillService
{
    Task<EtoroBackfillResult> ExecuteBackfillAsync(string symbol, string assetType, int etoroInstrumentId, CancellationToken ct = default);
}

public class EtoroBackfillResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int TotalRecordsInserted { get; set; }
    public TimeSpan Duration { get; set; }
    public string? Error { get; set; }
}

public class EtoroBackfillService : IEtoroBackfillService
{
    private readonly EtoroMarketDataProvider _provider;
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<EtoroBackfillService> _logger;

    private const int BatchSize = 500;

    public EtoroBackfillService(
        EtoroMarketDataProvider provider,
        IDbConnectionFactory connectionFactory,
        ILogger<EtoroBackfillService> logger)
    {
        _provider = provider;
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<EtoroBackfillResult> ExecuteBackfillAsync(string symbol, string assetType, int etoroInstrumentId, CancellationToken ct = default)
    {
        var result = new EtoroBackfillResult { Symbol = symbol };
        var sw = Stopwatch.StartNew();

        try
        {
            var barResult = await _provider.FetchBackfillBarsAsync(new BackfillBarRequest
            {
                InstrumentId = etoroInstrumentId,
                Symbol = symbol,
                AssetType = assetType,
                Count = 180,
                Interval = "OneDay"
            }, ct);

            if (!barResult.Success || barResult.Bars.Count == 0)
            {
                result.Error = barResult.Error ?? "No data returned";
                _logger.LogWarning("eToro backfill returned no data for {Symbol} (instrument {Id})", symbol, etoroInstrumentId);
                return result;
            }

            using var connection = _connectionFactory.CreateConnection();
            var dataSourceId = await connection.QueryFirstOrDefaultAsync<int>(
                "SELECT id FROM lookup_data_sources WHERE name = 'eToro' AND is_active = true");

            if (dataSourceId == 0)
                throw new InvalidOperationException("eToro data source not found in lookup_data_sources");

            var isCrypto = assetType.Equals("Crypto", StringComparison.OrdinalIgnoreCase);
            int tickerId;

            if (isCrypto)
            {
                tickerId = await connection.QueryFirstOrDefaultAsync<int>(
                    "SELECT id FROM crypto_tickers WHERE symbol = @Symbol", new { Symbol = symbol });
            }
            else
            {
                tickerId = await connection.QueryFirstOrDefaultAsync<int>(
                    "SELECT id FROM stock_tickers WHERE symbol = @Symbol", new { Symbol = symbol });
            }

            if (tickerId == 0)
                throw new InvalidOperationException($"Ticker '{symbol}' not found in DB");

            var totalInserted = isCrypto
                ? await UpsertCryptoPricesAsync(connection, tickerId, dataSourceId, barResult.Bars)
                : await UpsertStockPricesAsync(connection, tickerId, dataSourceId, barResult.Bars);

            sw.Stop();
            result.Success = true;
            result.TotalRecordsInserted = totalInserted;
            result.Duration = sw.Elapsed;

            _logger.LogInformation("eToro backfill complete for {Symbol}: {Count} daily bars in {Duration:F1}s",
                symbol, totalInserted, sw.Elapsed.TotalSeconds);
        }
        catch (Exception ex)
        {
            sw.Stop();
            result.Error = ex.Message;
            result.Duration = sw.Elapsed;
            _logger.LogError(ex, "eToro backfill failed for {Symbol}", symbol);
        }

        return result;
    }

    private async Task<int> UpsertStockPricesAsync(System.Data.IDbConnection connection, int tickerId, int dataSourceId, List<OhlcvBar> bars)
    {
        var total = 0;
        for (var i = 0; i < bars.Count; i += BatchSize)
        {
            var batch = bars.Skip(i).Take(BatchSize).ToList();
            var parameters = new DynamicParameters();
            var sb = new StringBuilder();

            for (var j = 0; j < batch.Count; j++)
            {
                if (j > 0) sb.Append(", ");
                sb.Append($"(@tid{j}, @dsid{j}, @pt{j}, @op{j}, @hp{j}, @lp{j}, @cp{j}, @vol{j})");
                parameters.Add($"tid{j}", tickerId);
                parameters.Add($"dsid{j}", dataSourceId);
                parameters.Add($"pt{j}", batch[j].Timestamp);
                parameters.Add($"op{j}", batch[j].Open);
                parameters.Add($"hp{j}", batch[j].High);
                parameters.Add($"lp{j}", batch[j].Low);
                parameters.Add($"cp{j}", batch[j].Close);
                parameters.Add($"vol{j}", (long)batch[j].Volume);
            }

            var sql = $@"
                INSERT INTO stock_prices (stock_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
                VALUES {sb}
                ON CONFLICT (stock_ticker_id, data_source_id, price_time)
                DO UPDATE SET open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price,
                              low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price, volume = EXCLUDED.volume";

            await connection.ExecuteAsync(sql, parameters);
            total += batch.Count;
        }
        return total;
    }

    private async Task<int> UpsertCryptoPricesAsync(System.Data.IDbConnection connection, int tickerId, int dataSourceId, List<OhlcvBar> bars)
    {
        var total = 0;
        for (var i = 0; i < bars.Count; i += BatchSize)
        {
            var batch = bars.Skip(i).Take(BatchSize).ToList();
            var parameters = new DynamicParameters();
            var sb = new StringBuilder();

            for (var j = 0; j < batch.Count; j++)
            {
                if (j > 0) sb.Append(", ");
                sb.Append($"(@tid{j}, @dsid{j}, @pt{j}, @op{j}, @hp{j}, @lp{j}, @cp{j}, @vol{j})");
                parameters.Add($"tid{j}", tickerId);
                parameters.Add($"dsid{j}", dataSourceId);
                parameters.Add($"pt{j}", batch[j].Timestamp);
                parameters.Add($"op{j}", batch[j].Open);
                parameters.Add($"hp{j}", batch[j].High);
                parameters.Add($"lp{j}", batch[j].Low);
                parameters.Add($"cp{j}", batch[j].Close);
                parameters.Add($"vol{j}", batch[j].Volume);
            }

            var sql = $@"
                INSERT INTO crypto_prices (crypto_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
                VALUES {sb}
                ON CONFLICT (crypto_ticker_id, data_source_id, price_time)
                DO UPDATE SET open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price,
                              low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price, volume = EXCLUDED.volume";

            await connection.ExecuteAsync(sql, parameters);
            total += batch.Count;
        }
        return total;
    }
}
