using Dapper;
using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public class StockTickerRepository : IStockTickerRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public StockTickerRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<IEnumerable<StockTicker>> GetActiveTickersAsync(string exchange, string currency)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM stock_tickers 
            WHERE is_active = true 
              AND exchange = @Exchange 
              AND currency = @Currency
            ORDER BY symbol";
        
        return await connection.QueryAsync<StockTicker>(sql, new { Exchange = exchange, Currency = currency });
    }

    public async Task<IEnumerable<StockTicker>> GetActiveTickersAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM stock_tickers 
            WHERE is_active = true
            ORDER BY symbol";
        
        return await connection.QueryAsync<StockTicker>(sql);
    }

    public async Task<StockTicker?> GetBySymbolAsync(string symbol)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM stock_tickers 
            WHERE symbol = @Symbol";
        
        return await connection.QueryFirstOrDefaultAsync<StockTicker>(sql, new { Symbol = symbol.ToUpperInvariant() });
    }

    public async Task<StockTicker> GetOrCreateTickerAsync(string symbol, string exchange = "NASDAQ", string currency = "USD")
    {
        symbol = symbol.ToUpperInvariant();
        
        // Try to get existing ticker first
        var existingTicker = await GetBySymbolAsync(symbol);
        if (existingTicker != null)
        {
            return existingTicker;
        }

        // Create new ticker
        using var connection = _connectionFactory.CreateConnection();
        
        const string insertSql = @"
            INSERT INTO stock_tickers (universe_id, symbol, name, exchange, currency, is_active, created_at, updated_at)
            VALUES (1, @Symbol, @Symbol, @Exchange, @Currency, true, NOW(), NOW())
            RETURNING 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt";
        
        var newTicker = await connection.QuerySingleAsync<StockTicker>(insertSql, new 
        { 
            Symbol = symbol, 
            Exchange = exchange, 
            Currency = currency 
        });
        
        return newTicker;
    }

    public async Task<IEnumerable<StockTicker>> GetAllTickersAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM stock_tickers 
            ORDER BY symbol";
        
        return await connection.QueryAsync<StockTicker>(sql);
    }

    public async Task<StockTicker?> GetByIdAsync(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM stock_tickers 
            WHERE id = @Id";
        
        return await connection.QueryFirstOrDefaultAsync<StockTicker>(sql, new { Id = id });
    }

    public async Task<StockTicker> CreateTickerAsync(string symbol, string? name, string? exchange, string currency)
    {
        symbol = symbol.ToUpperInvariant();
        
        using var connection = _connectionFactory.CreateConnection();
        
        const string insertSql = @"
            INSERT INTO stock_tickers (universe_id, symbol, name, exchange, currency, is_active, created_at, updated_at)
            VALUES (1, @Symbol, @Name, @Exchange, @Currency, true, NOW(), NOW())
            RETURNING 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt";
        
        return await connection.QuerySingleAsync<StockTicker>(insertSql, new 
        { 
            Symbol = symbol, 
            Name = name ?? symbol,
            Exchange = exchange ?? "NASDAQ", 
            Currency = currency 
        });
    }

    public async Task<StockTicker?> UpdateActiveStatusAsync(int id, bool isActive)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string updateSql = @"
            UPDATE stock_tickers 
            SET is_active = @IsActive, updated_at = NOW()
            WHERE id = @Id
            RETURNING 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                exchange as Exchange, 
                currency as Currency, 
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt";
        
        return await connection.QueryFirstOrDefaultAsync<StockTicker>(updateSql, new { Id = id, IsActive = isActive });
    }
}

