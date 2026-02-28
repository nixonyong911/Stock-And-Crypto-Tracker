using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

public class CryptoTickerRepository : ICryptoTickerRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoTickerRepository> _logger;

    public CryptoTickerRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoTickerRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
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
            WHERE symbol = @Symbol AND is_active = true";

        return await connection.QueryFirstOrDefaultAsync<CryptoTicker>(sql, new { Symbol = symbol });
    }
}
