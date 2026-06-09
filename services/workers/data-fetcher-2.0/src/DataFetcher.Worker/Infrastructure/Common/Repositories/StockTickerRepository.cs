using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

/// <summary>
/// Repository implementation for stock ticker operations.
/// </summary>
public class StockTickerRepository : IStockTickerRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<StockTickerRepository> _logger;

    public StockTickerRepository(IDbConnectionFactory connectionFactory, ILogger<StockTickerRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
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

    /// <inheritdoc />
    public async Task<IEnumerable<StockTicker>> GetTickersByDataSourceAsync(int dataSourceId)
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
            WHERE is_active = true AND preferred_data_source_id = @DataSourceId
            ORDER BY symbol";

        return await connection.QueryAsync<StockTicker>(sql, new { DataSourceId = dataSourceId });
    }

    /// <inheritdoc />
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

    /// <inheritdoc />
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
            WHERE symbol = @Symbol AND is_active = true";

        return await connection.QueryFirstOrDefaultAsync<StockTicker>(sql, new { Symbol = symbol });
    }

    /// <inheritdoc />
    public async Task<bool> NeedsLogoRefreshAsync(int stockTickerId, int maxAgeDays)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT (logo_bytes IS NULL
                    OR logo_fetched_at IS NULL
                    OR logo_fetched_at < NOW() - (@MaxAgeDays || ' days')::INTERVAL)
            FROM stock_tickers
            WHERE id = @StockTickerId";

        // Default to refreshing when the row is missing (null result).
        var result = await connection.QueryFirstOrDefaultAsync<bool?>(sql,
            new { StockTickerId = stockTickerId, MaxAgeDays = maxAgeDays });
        return result ?? true;
    }

    /// <inheritdoc />
    public async Task UpdateLogoAsync(int stockTickerId, byte[] logoBytes, string contentType)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            UPDATE stock_tickers
            SET logo_bytes = @LogoBytes,
                logo_content_type = @ContentType,
                logo_fetched_at = NOW(),
                updated_at = NOW()
            WHERE id = @StockTickerId";

        await connection.ExecuteAsync(sql,
            new { StockTickerId = stockTickerId, LogoBytes = logoBytes, ContentType = contentType });
        _logger.LogDebug("Updated logo ({Bytes} bytes) for ticker {TickerId}", logoBytes.Length, stockTickerId);
    }
}
