using Dapper;
using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public class CryptoTickerRepository : ICryptoTickerRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    // Universe ID for crypto (assuming 3 based on typical setup: 1=stocks, 2=etf, 3=crypto)
    private const int CryptoUniverseId = 3;

    public CryptoTickerRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<IEnumerable<CryptoTicker>> GetActiveTickersAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                slug as Slug,
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM crypto_tickers 
            WHERE is_active = true
            ORDER BY symbol";
        
        return await connection.QueryAsync<CryptoTicker>(sql);
    }

    public async Task<IEnumerable<CryptoTicker>> GetAllTickersAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                slug as Slug,
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM crypto_tickers 
            ORDER BY symbol";
        
        return await connection.QueryAsync<CryptoTicker>(sql);
    }

    public async Task<CryptoTicker?> GetBySymbolAsync(string symbol)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                slug as Slug,
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM crypto_tickers 
            WHERE symbol = @Symbol";
        
        return await connection.QueryFirstOrDefaultAsync<CryptoTicker>(sql, new { Symbol = symbol.ToUpperInvariant() });
    }

    public async Task<CryptoTicker?> GetByIdAsync(int id)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                slug as Slug,
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt
            FROM crypto_tickers 
            WHERE id = @Id";
        
        return await connection.QueryFirstOrDefaultAsync<CryptoTicker>(sql, new { Id = id });
    }

    public async Task<CryptoTicker> CreateTickerAsync(string symbol, string? name)
    {
        symbol = symbol.ToUpperInvariant();
        
        using var connection = _connectionFactory.CreateConnection();
        
        // Generate slug from symbol (e.g., "BTC/USD" -> "btc-usd")
        var slug = symbol.ToLowerInvariant().Replace("/", "-");
        
        const string insertSql = @"
            INSERT INTO crypto_tickers (universe_id, symbol, name, slug, is_active, created_at, updated_at)
            VALUES (@UniverseId, @Symbol, @Name, @Slug, true, NOW(), NOW())
            RETURNING 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                slug as Slug,
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt";
        
        return await connection.QuerySingleAsync<CryptoTicker>(insertSql, new 
        { 
            UniverseId = CryptoUniverseId,
            Symbol = symbol, 
            Name = name ?? symbol,
            Slug = slug
        });
    }

    public async Task<CryptoTicker?> UpdateActiveStatusAsync(int id, bool isActive)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string updateSql = @"
            UPDATE crypto_tickers 
            SET is_active = @IsActive, updated_at = NOW()
            WHERE id = @Id
            RETURNING 
                id as Id, 
                universe_id as UniverseId, 
                symbol as Symbol, 
                name as Name, 
                slug as Slug,
                is_active as IsActive, 
                created_at as CreatedAt, 
                updated_at as UpdatedAt";
        
        return await connection.QueryFirstOrDefaultAsync<CryptoTicker>(updateSql, new { Id = id, IsActive = isActive });
    }
}
