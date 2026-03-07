using System.Text;
using Dapper;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Domain.Providers.Alpaca.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Alpaca.Repositories;

public class AlpacaStockPriceRepository : IAlpacaStockPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<AlpacaStockPriceRepository> _logger;
    private const int BatchSize = 500;

    public AlpacaStockPriceRepository(IDbConnectionFactory connectionFactory, ILogger<AlpacaStockPriceRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<DataSource?> GetDataSourceByNameAsync(string name)
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT id as Id, name as Name, base_url as BaseUrl, is_active as IsActive
            FROM lookup_data_sources WHERE name = @Name AND is_active = true";
        return await connection.QueryFirstOrDefaultAsync<DataSource>(sql, new { Name = name });
    }

    public async Task UpsertStockPricesBatchAsync(IList<AlpacaStockPriceRow> prices)
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
                valueClauses.Append($"(@tid{j}, @dsid{j}, @pt{j}, @op{j}, @hp{j}, @lp{j}, @cp{j}, @vol{j})");
                parameters.Add($"tid{j}", batch[j].StockTickerId);
                parameters.Add($"dsid{j}", batch[j].DataSourceId);
                parameters.Add($"pt{j}", batch[j].PriceTime);
                parameters.Add($"op{j}", batch[j].OpenPrice);
                parameters.Add($"hp{j}", batch[j].HighPrice);
                parameters.Add($"lp{j}", batch[j].LowPrice);
                parameters.Add($"cp{j}", batch[j].ClosePrice);
                parameters.Add($"vol{j}", batch[j].Volume);
            }

            var sql = $@"
                INSERT INTO stock_prices (stock_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
                VALUES {valueClauses}
                ON CONFLICT (stock_ticker_id, data_source_id, price_time)
                DO UPDATE SET open_price = EXCLUDED.open_price,
                              high_price = EXCLUDED.high_price,
                              low_price = EXCLUDED.low_price,
                              close_price = EXCLUDED.close_price,
                              volume = EXCLUDED.volume";

            await connection.ExecuteAsync(sql, parameters);
        }

        _logger.LogDebug("Upserted {Count} stock prices in {Batches} batches", prices.Count, (prices.Count + BatchSize - 1) / BatchSize);
    }
}
