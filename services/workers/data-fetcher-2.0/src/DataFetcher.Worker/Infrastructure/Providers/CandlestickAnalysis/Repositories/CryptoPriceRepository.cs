using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

public class CryptoPriceRepository : ICryptoPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoPriceRepository> _logger;

    public CryptoPriceRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoPriceRepository> logger)
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

    public async Task<CryptoTicker?> GetTickerBySymbolAsync(string symbol)
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

    public async Task<IEnumerable<CryptoPrice>> GetPricesForDateAsync(int cryptoTickerId, DateOnly date)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                crypto_ticker_id as CryptoTickerId,
                data_source_id as DataSourceId,
                price_time as PriceTime,
                open_price as OpenPrice,
                high_price as HighPrice,
                low_price as LowPrice,
                close_price as ClosePrice,
                volume as Volume,
                created_at as CreatedAt
            FROM crypto_prices
            WHERE crypto_ticker_id = @CryptoTickerId
              AND price_time::date = @Date
            ORDER BY price_time";

        return await connection.QueryAsync<CryptoPrice>(sql, new { CryptoTickerId = cryptoTickerId, Date = date });
    }

    public async Task<IEnumerable<DateOnly>> GetDistinctPriceDatesAsync(int cryptoTickerId, DateOnly startDate, DateOnly endDate)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT DISTINCT price_time::date as PriceDate
            FROM crypto_prices
            WHERE crypto_ticker_id = @CryptoTickerId
              AND price_time::date >= @StartDate
              AND price_time::date <= @EndDate
            ORDER BY PriceDate";

        var dates = await connection.QueryAsync<DateTime>(sql, new
        {
            CryptoTickerId = cryptoTickerId,
            StartDate = startDate,
            EndDate = endDate
        });

        return dates.Select(d => DateOnly.FromDateTime(d));
    }
}
