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
}

