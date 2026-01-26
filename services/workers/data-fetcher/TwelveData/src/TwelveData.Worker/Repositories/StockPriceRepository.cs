using System.Text;
using Dapper;
using Microsoft.Extensions.Logging;
using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public class StockPriceRepository : IStockPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<StockPriceRepository> _logger;

    // Batch size of 500 = 4000 parameters (8 columns * 500 rows)
    // PostgreSQL limit is 65535 parameters, so this is well within limits
    private const int BatchSize = 500;

    public StockPriceRepository(IDbConnectionFactory connectionFactory, ILogger<StockPriceRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<DataSource?> GetDataSourceByNameAsync(string name)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                name as Name,
                description as Description,
                base_url as BaseUrl,
                supports_stocks as SupportsStocks,
                supports_crypto as SupportsCrypto,
                is_active as IsActive,
                created_at as CreatedAt,
                updated_at as UpdatedAt
            FROM lookup_data_sources
            WHERE name = @Name AND is_active = true";

        return await connection.QueryFirstOrDefaultAsync<DataSource>(sql, new { Name = name });
    }

    public async Task UpsertStockPriceAsync(StockPrice price)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO stock_prices (stock_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
            VALUES (@StockTickerId, @DataSourceId, @PriceTime, @OpenPrice, @HighPrice, @LowPrice, @ClosePrice, @Volume)
            ON CONFLICT (stock_ticker_id, data_source_id, price_time)
            DO UPDATE SET
                open_price = EXCLUDED.open_price,
                high_price = EXCLUDED.high_price,
                low_price = EXCLUDED.low_price,
                close_price = EXCLUDED.close_price,
                volume = EXCLUDED.volume";

        await connection.ExecuteAsync(sql, price);
    }

    /// <summary>
    /// Optimized batch upsert using multi-value INSERT for ~100x performance improvement.
    /// Processes records in batches of 500 to stay within PostgreSQL parameter limits.
    /// </summary>
    public async Task UpsertStockPricesBatchAsync(IEnumerable<StockPrice> prices)
    {
        var priceList = prices.ToList();
        if (priceList.Count == 0) return;

        var totalRecords = priceList.Count;
        var batchCount = (int)Math.Ceiling((double)totalRecords / BatchSize);
        var totalStopwatch = System.Diagnostics.Stopwatch.StartNew();

        _logger.LogInformation(
            "Starting batch upsert: {TotalRecords} records in {BatchCount} batches",
            totalRecords, batchCount);

        for (int i = 0; i < priceList.Count; i += BatchSize)
        {
            var batch = priceList.Skip(i).Take(BatchSize).ToList();
            var batchNumber = (i / BatchSize) + 1;
            var batchStopwatch = System.Diagnostics.Stopwatch.StartNew();

            await UpsertBatchAsync(batch);

            batchStopwatch.Stop();
            _logger.LogDebug(
                "Batch {BatchNumber}/{TotalBatches}: {RecordCount} records in {ElapsedMs}ms",
                batchNumber, batchCount, batch.Count, batchStopwatch.ElapsedMilliseconds);
        }

        totalStopwatch.Stop();
        _logger.LogInformation(
            "Batch upsert completed: {TotalRecords} records in {ElapsedSeconds:F1}s ({BatchCount} batches, {RecordsPerSecond:F0} records/sec)",
            totalRecords,
            totalStopwatch.Elapsed.TotalSeconds,
            batchCount,
            totalRecords / totalStopwatch.Elapsed.TotalSeconds);
    }

    /// <summary>
    /// Executes a single batch upsert using multi-value INSERT with ON CONFLICT.
    /// </summary>
    private async Task UpsertBatchAsync(List<StockPrice> batch)
    {
        using var connection = _connectionFactory.CreateConnection();

        var sb = new StringBuilder();
        sb.AppendLine(@"INSERT INTO stock_prices
            (stock_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume)
            VALUES ");

        var parameters = new DynamicParameters();

        for (int i = 0; i < batch.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.AppendLine($"(@tid{i}, @sid{i}, @pt{i}, @op{i}, @hp{i}, @lp{i}, @cp{i}, @vol{i})");

            parameters.Add($"tid{i}", batch[i].StockTickerId);
            parameters.Add($"sid{i}", batch[i].DataSourceId);
            parameters.Add($"pt{i}", batch[i].PriceTime);
            parameters.Add($"op{i}", batch[i].OpenPrice);
            parameters.Add($"hp{i}", batch[i].HighPrice);
            parameters.Add($"lp{i}", batch[i].LowPrice);
            parameters.Add($"cp{i}", batch[i].ClosePrice);
            parameters.Add($"vol{i}", batch[i].Volume);
        }

        sb.AppendLine(@"ON CONFLICT (stock_ticker_id, data_source_id, price_time)
            DO UPDATE SET
                open_price = EXCLUDED.open_price,
                high_price = EXCLUDED.high_price,
                low_price = EXCLUDED.low_price,
                close_price = EXCLUDED.close_price,
                volume = EXCLUDED.volume");

        await connection.ExecuteAsync(sb.ToString(), parameters);
    }
}

