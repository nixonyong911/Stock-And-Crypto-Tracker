using Dapper;
using Microsoft.Extensions.Logging;
using CandlestickAnalysis.Worker.Models;

namespace CandlestickAnalysis.Worker.Repositories;

/// <summary>
/// Repository for reading stock prices using Dapper.
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
        // Get all 15-minute candles for the given date
        // Using date range to capture the full trading day
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

    public async Task<AnalysisSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName)
    {
        const string sql = @"
            SELECT 
                fs.id AS Id,
                fs.data_source_id AS DataSourceId,
                fs.worker_id AS WorkerId,
                fs.name AS Name,
                fs.description AS Description,
                fs.schedule_time AS ScheduleTime,
                fs.schedule_timezone AS ScheduleTimezone,
                fs.is_enabled AS IsEnabled,
                fs.fetch_config::text AS FetchConfig,
                fs.last_run_at AS LastRunAt,
                fs.last_run_status AS LastRunStatus,
                fs.last_run_message AS LastRunMessage
            FROM worker_fetch_schedules fs
            JOIN data_sources ds ON fs.data_source_id = ds.id
            WHERE ds.name = @DataSourceName
              AND fs.is_enabled = true
            LIMIT 1";

        using var connection = _connectionFactory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<AnalysisSchedule>(sql, new { DataSourceName = dataSourceName });
    }

    public async Task UpdateScheduleStatusAsync(int scheduleId, string status, string message)
    {
        const string sql = @"
            UPDATE worker_fetch_schedules
            SET last_run_at = @LastRunAt,
                last_run_status = @Status,
                last_run_message = @Message,
                updated_at = @UpdatedAt
            WHERE id = @ScheduleId";

        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(sql, new 
        { 
            ScheduleId = scheduleId,
            LastRunAt = DateTime.UtcNow,
            Status = status,
            Message = message,
            UpdatedAt = DateTime.UtcNow
        });
    }
}

