using AlphaVantage.Worker.Models;
using Dapper;

namespace AlphaVantage.Worker.Repositories;

public class StockRepository : IStockRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public StockRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<Stock?> GetBySymbolAsync(string symbol)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT id, symbol, name, exchange, currency, is_active as IsActive, 
                   created_at as CreatedAt, updated_at as UpdatedAt
            FROM stocks 
            WHERE symbol = @Symbol";
        
        return await connection.QueryFirstOrDefaultAsync<Stock>(sql, new { Symbol = symbol.ToUpperInvariant() });
    }

    public async Task<Stock> CreateStockAsync(string symbol, string? name = null)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            INSERT INTO stocks (symbol, name) 
            VALUES (@Symbol, @Name)
            ON CONFLICT (symbol) DO UPDATE SET name = COALESCE(@Name, stocks.name)
            RETURNING id, symbol, name, exchange, currency, is_active as IsActive, 
                      created_at as CreatedAt, updated_at as UpdatedAt";
        
        return await connection.QueryFirstAsync<Stock>(sql, new { Symbol = symbol.ToUpperInvariant(), Name = name });
    }

    public async Task<DataSource?> GetDataSourceByNameAsync(string name)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT id, name, description, api_type as ApiType, is_active as IsActive,
                   created_at as CreatedAt, updated_at as UpdatedAt
            FROM data_sources 
            WHERE name = @Name AND is_active = true";
        
        return await connection.QueryFirstOrDefaultAsync<DataSource>(sql, new { Name = name });
    }

    public async Task<bool> StockPriceExistsAsync(Guid stockId, Guid dataSourceId, DateTime priceDate)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT EXISTS(
                SELECT 1 FROM stock_prices 
                WHERE stock_id = @StockId 
                  AND data_source_id = @DataSourceId 
                  AND price_date = @PriceDate
            )";
        
        return await connection.ExecuteScalarAsync<bool>(sql, new { StockId = stockId, DataSourceId = dataSourceId, PriceDate = priceDate.Date });
    }

    public async Task InsertStockPriceAsync(StockDailyPrice price)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            INSERT INTO stock_prices (stock_id, data_source_id, price_date, open_price, high_price, low_price, close_price, adjusted_close, volume)
            VALUES (@StockId, @DataSourceId, @PriceDate, @OpenPrice, @HighPrice, @LowPrice, @ClosePrice, @AdjustedClose, @Volume)";
        
        await connection.ExecuteAsync(sql, price);
    }

    public async Task UpsertStockPriceAsync(StockDailyPrice price)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            INSERT INTO stock_prices (stock_id, data_source_id, price_date, open_price, high_price, low_price, close_price, adjusted_close, volume)
            VALUES (@StockId, @DataSourceId, @PriceDate, @OpenPrice, @HighPrice, @LowPrice, @ClosePrice, @AdjustedClose, @Volume)
            ON CONFLICT (stock_id, data_source_id, price_date) 
            DO UPDATE SET 
                open_price = EXCLUDED.open_price,
                high_price = EXCLUDED.high_price,
                low_price = EXCLUDED.low_price,
                close_price = EXCLUDED.close_price,
                adjusted_close = EXCLUDED.adjusted_close,
                volume = EXCLUDED.volume";
        
        await connection.ExecuteAsync(sql, price);
    }

    public async Task<IEnumerable<Stock>> GetActiveStocksAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT id, symbol, name, exchange, currency, is_active as IsActive, 
                   created_at as CreatedAt, updated_at as UpdatedAt
            FROM stocks 
            WHERE is_active = true
            ORDER BY symbol";
        
        return await connection.QueryAsync<Stock>(sql);
    }
}

