using System.Text;
using Dapper;
using Microsoft.Extensions.Logging;
using StockTracker.Data.Entities;

namespace TwelveData.Worker.Repositories;

public class CryptoPriceRepository : ICryptoPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoPriceRepository> _logger;
    
    // Batch size of 500 = 4500 parameters (9 columns * 500 rows)
    // PostgreSQL limit is 65535 parameters, so this is well within limits
    private const int BatchSize = 500;

    public CryptoPriceRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoPriceRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<Models.DataSource?> GetDataSourceByNameAsync(string name)
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
        
        return await connection.QueryFirstOrDefaultAsync<Models.DataSource>(sql, new { Name = name });
    }

    /// <summary>
    /// Optimized batch upsert using multi-value INSERT for ~100x performance improvement.
    /// Processes records in batches of 500 to stay within PostgreSQL parameter limits.
    /// </summary>
    public async Task UpsertCryptoPricesBatchAsync(List<CryptoPrice> prices)
    {
        if (prices.Count == 0) return;

        var totalRecords = prices.Count;
        var batchCount = (int)Math.Ceiling((double)totalRecords / BatchSize);
        var totalStopwatch = System.Diagnostics.Stopwatch.StartNew();

        _logger.LogInformation(
            "Starting crypto batch upsert: {TotalRecords} records in {BatchCount} batches",
            totalRecords, batchCount);

        for (int i = 0; i < prices.Count; i += BatchSize)
        {
            var batch = prices.Skip(i).Take(BatchSize).ToList();
            var batchNumber = (i / BatchSize) + 1;
            var batchStopwatch = System.Diagnostics.Stopwatch.StartNew();
            
            await UpsertBatchAsync(batch);
            
            batchStopwatch.Stop();
            _logger.LogDebug(
                "Crypto batch {BatchNumber}/{TotalBatches}: {RecordCount} records in {ElapsedMs}ms",
                batchNumber, batchCount, batch.Count, batchStopwatch.ElapsedMilliseconds);
        }

        totalStopwatch.Stop();
        _logger.LogInformation(
            "Crypto batch upsert completed: {TotalRecords} records in {ElapsedSeconds:F1}s ({BatchCount} batches, {RecordsPerSecond:F0} records/sec)",
            totalRecords, 
            totalStopwatch.Elapsed.TotalSeconds, 
            batchCount,
            totalRecords / totalStopwatch.Elapsed.TotalSeconds);
    }

    /// <summary>
    /// Executes a single batch upsert using multi-value INSERT with ON CONFLICT.
    /// </summary>
    private async Task UpsertBatchAsync(List<CryptoPrice> batch)
    {
        using var connection = _connectionFactory.CreateConnection();

        var sb = new StringBuilder();
        sb.AppendLine(@"INSERT INTO crypto_prices 
            (crypto_ticker_id, data_source_id, price_time, open_price, high_price, low_price, close_price, volume, market_cap)
            VALUES ");

        var parameters = new DynamicParameters();
        
        for (int i = 0; i < batch.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.AppendLine($"(@tid{i}, @sid{i}, @pt{i}, @op{i}, @hp{i}, @lp{i}, @cp{i}, @vol{i}, @mc{i})");

            parameters.Add($"tid{i}", batch[i].CryptoTickerId);
            parameters.Add($"sid{i}", batch[i].DataSourceId);
            parameters.Add($"pt{i}", batch[i].PriceTime);
            parameters.Add($"op{i}", batch[i].OpenPrice);
            parameters.Add($"hp{i}", batch[i].HighPrice);
            parameters.Add($"lp{i}", batch[i].LowPrice);
            parameters.Add($"cp{i}", batch[i].ClosePrice);
            parameters.Add($"vol{i}", batch[i].Volume);
            parameters.Add($"mc{i}", batch[i].MarketCap);
        }

        sb.AppendLine(@"ON CONFLICT (crypto_ticker_id, data_source_id, price_time) 
            DO UPDATE SET 
                open_price = EXCLUDED.open_price,
                high_price = EXCLUDED.high_price,
                low_price = EXCLUDED.low_price,
                close_price = EXCLUDED.close_price,
                volume = EXCLUDED.volume,
                market_cap = EXCLUDED.market_cap");

        await connection.ExecuteAsync(sb.ToString(), parameters);
    }
}
