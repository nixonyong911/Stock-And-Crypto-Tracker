using System.Data.Common;
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

        using var connection = (DbConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync();  // Explicitly open before query for Supavisor compatibility
        var results = await connection.QueryAsync<StockTicker>(sql);
        return results.AsList();  // Force immediate materialization
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

        using var connection = (DbConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync();  // Explicitly open before query for Supavisor compatibility
        var prices = await connection.QueryAsync<StockPrice>(sql, new 
        { 
            StockTickerId = stockTickerId, 
            StartOfDay = startOfDay,
            EndOfDay = endOfDay
        });
        var priceList = prices.AsList();  // Force immediate materialization

        _logger.LogDebug("Found {Count} candles for ticker {TickerId} on {Date}", 
            priceList.Count, stockTickerId, date);

        return priceList;
    }

    public async Task<AnalysisSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName)
    {
        const string sql = @"
            SELECT 
                fs.id AS Id,
                fs.data_source_id AS DataSourceId,
                fs.name AS Name,
                fs.description AS Description,
                fs.schedule_time_utc AS ScheduleTimeUtc,
                fs.is_enabled AS IsEnabled,
                fs.fetch_config::text AS FetchConfig,
                fs.last_run_at AS LastRunAt,
                fs.last_run_status AS LastRunStatus,
                fs.last_run_message AS LastRunMessage
            FROM fetch_schedules fs
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
            UPDATE fetch_schedules
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

