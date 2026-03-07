using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Alpaca.Repositories;

public class AlpacaCryptoPriceRepository : IAlpacaCryptoPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<AlpacaCryptoPriceRepository> _logger;
    private const int BatchSize = 500;

    public AlpacaCryptoPriceRepository(IDbConnectionFactory connectionFactory, ILogger<AlpacaCryptoPriceRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task UpsertCryptoPricesBatchAsync(IList<AlpacaCryptoPriceRow> prices)
    {
        if (prices.Count == 0) return;

        using var connection = _connectionFactory.CreateConnection();

        for (var i = 0; i < prices.Count; i += BatchSize)
        {
            var batch = prices.Skip(i).Take(BatchSize).ToList();
            var parameters = new DynamicParameters();
            var valueClauses = new StringBuilder();

            for (var j = 0; j < batch.Count; j++)
            {
                if (j > 0) valueClauses.Append(", ");
                valueClauses.Append($"(@tid{j}, @dsid{j}, @pt{j}, @op{j}, @hp{j}, @lp{j}, @cp{j}, @vol{j}, @mc{j})");
                parameters.Add($"tid{j}", batch[j].CryptoTickerId);
                parameters.Add($"dsid{j}", batch[j].DataSourceId);
                parameters.Add($"pt{j}", batch[j].PriceTime);
                parameters.Add($"op{j}", batch[j].OpenPrice);
                parameters.Add($"hp{j}", batch[j].HighPrice);
                parameters.Add($"lp{j}", batch[j].LowPrice);
                parameters.Add($"cp{j}", batch[j].ClosePrice);
                parameters.Add($"vol{j}", batch[j].Volume);
                parameters.Add($"mc{j}", batch[j].MarketCap);
            }

            var sql = $@"
                INSERT INTO crypto_prices (crypto_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume, market_cap)
                VALUES {valueClauses}
                ON CONFLICT (crypto_ticker_id, data_source_id, price_time)
                DO UPDATE SET open_price = EXCLUDED.open_price,
                              high_price = EXCLUDED.high_price,
                              low_price = EXCLUDED.low_price,
                              close_price = EXCLUDED.close_price,
                              volume = EXCLUDED.volume,
                              market_cap = EXCLUDED.market_cap";

            await connection.ExecuteAsync(sql, parameters);
        }

        _logger.LogDebug("Upserted {Count} crypto prices in {Batches} batches", prices.Count, (prices.Count + BatchSize - 1) / BatchSize);
    }
}
