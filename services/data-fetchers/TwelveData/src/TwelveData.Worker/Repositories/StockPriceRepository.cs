using Dapper;
using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public class StockPriceRepository : IStockPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public StockPriceRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
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
            FROM data_sources 
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

    public async Task UpsertStockPricesBatchAsync(IEnumerable<StockPrice> prices)
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
        
        await connection.ExecuteAsync(sql, prices);
    }
}

