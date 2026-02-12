using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

/// <summary>
/// Repository for reading stock prices used in candlestick analysis.
/// </summary>
public class StockPriceRepository : IStockPriceRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<StockPriceRepository> _logger;

    public StockPriceRepository(
        IDbConnectionFactory connectionFactory,
        ILogger<StockPriceRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<IEnumerable<StockTicker>> GetActiveTickersAsync()
    {
        const string sql = @"
            SELECT
                id AS Id,
                symbol AS Symbol,
                name AS Name,
                exchange AS Exchange,
                is_active AS IsActive
            FROM stock_tickers
            WHERE is_active = true
            ORDER BY symbol";

        using var connection = _connectionFactory.CreateConnection();
        return await connection.QueryAsync<StockTicker>(sql);
    }

    public async Task<StockTicker?> GetTickerBySymbolAsync(string symbol)
    {
        const string sql = @"
            SELECT
                id AS Id,
                symbol AS Symbol,
                name AS Name,
                exchange AS Exchange,
                is_active AS IsActive
            FROM stock_tickers
            WHERE symbol = @Symbol
            LIMIT 1";

        using var connection = _connectionFactory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<StockTicker>(sql, new { Symbol = symbol.ToUpperInvariant() });
    }

    public async Task<IEnumerable<StockPrice>> GetPricesForDateAsync(int stockTickerId, DateOnly date)
    {
        var startOfDay = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endOfDay = date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        const string sql = @"
            SELECT
                id AS Id,
                stock_ticker_id AS StockTickerId,
                data_source_id AS DataSourceId,
                price_time AS PriceTime,
                open_price AS OpenPrice,
                high_price AS HighPrice,
                low_price AS LowPrice,
                close_price AS ClosePrice,
                volume AS Volume,
                created_at AS CreatedAt
            FROM stock_prices
            WHERE stock_ticker_id = @StockTickerId
              AND price_time >= @StartOfDay
              AND price_time < @EndOfDay
            ORDER BY price_time ASC";

        using var connection = _connectionFactory.CreateConnection();
        var prices = await connection.QueryAsync<StockPrice>(sql, new
        {
            StockTickerId = stockTickerId,
            StartOfDay = startOfDay,
            EndOfDay = endOfDay
        });

        _logger.LogDebug("Found {Count} candles for ticker {TickerId} on {Date}",
            prices.Count(), stockTickerId, date);

        return prices;
    }

    public async Task<IEnumerable<DateOnly>> GetDistinctPriceDatesAsync(int stockTickerId, DateOnly startDate, DateOnly endDate)
    {
        var startDateTime = startDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endDateTime = endDate.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        const string sql = @"
            SELECT DISTINCT DATE(price_time AT TIME ZONE 'UTC') as price_date
            FROM stock_prices
            WHERE stock_ticker_id = @StockTickerId
              AND price_time >= @StartDate
              AND price_time <= @EndDate
            ORDER BY price_date ASC";

        using var connection = _connectionFactory.CreateConnection();
        var dates = await connection.QueryAsync<DateTime>(sql, new
        {
            StockTickerId = stockTickerId,
            StartDate = startDateTime,
            EndDate = endDateTime
        });

        return dates.Select(d => DateOnly.FromDateTime(d));
    }
}
