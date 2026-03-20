using Dapper;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

/// <summary>
/// Dapper-based repository implementation for stock technical indicator operations.
/// </summary>
public class StockIndicatorRepository : IStockIndicatorRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<StockIndicatorRepository> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="StockIndicatorRepository"/> class.
    /// </summary>
    /// <param name="connectionFactory">Factory for creating database connections.</param>
    /// <param name="logger">Logger instance.</param>
    public StockIndicatorRepository(IDbConnectionFactory connectionFactory, ILogger<StockIndicatorRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task BulkUpsertAsync(IEnumerable<StockIndicator> indicators)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_indicators_stock_free
                (stock_ticker_id, data_source_id, indicator_time, sma, ema, macd_value, macd_signal, macd_histogram, rsi)
            VALUES
                (@StockTickerId, @DataSourceId, @IndicatorTime, @Sma, @Ema, @MacdValue, @MacdSignal, @MacdHistogram, @Rsi)
            ON CONFLICT (stock_ticker_id, data_source_id, indicator_time) DO UPDATE SET
                sma = COALESCE(EXCLUDED.sma, analysis_indicators_stock_free.sma),
                ema = COALESCE(EXCLUDED.ema, analysis_indicators_stock_free.ema),
                macd_value = COALESCE(EXCLUDED.macd_value, analysis_indicators_stock_free.macd_value),
                macd_signal = COALESCE(EXCLUDED.macd_signal, analysis_indicators_stock_free.macd_signal),
                macd_histogram = COALESCE(EXCLUDED.macd_histogram, analysis_indicators_stock_free.macd_histogram),
                rsi = COALESCE(EXCLUDED.rsi, analysis_indicators_stock_free.rsi)";

        await connection.ExecuteAsync(sql, indicators);
        _logger.LogDebug("Bulk upserted {Count} indicator records", indicators.Count());
    }

    /// <inheritdoc />
    public async Task DeleteOldRecordsAsync(int stockTickerId, int retentionDays = 90)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "DELETE FROM analysis_indicators_stock_free WHERE stock_ticker_id = @StockTickerId AND indicator_time < NOW() - make_interval(days => @RetentionDays)";

        var deleted = await connection.ExecuteAsync(sql, new { StockTickerId = stockTickerId, RetentionDays = retentionDays });
        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} old indicator records for ticker {TickerId}", deleted, stockTickerId);
        }
    }

    /// <inheritdoc />
    public async Task<IEnumerable<StockIndicator>> GetByTickerAndDateAsync(int stockTickerId, DateTime date)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                stock_ticker_id as StockTickerId,
                data_source_id as DataSourceId,
                indicator_time as IndicatorTime,
                sma as Sma,
                ema as Ema,
                macd_value as MacdValue,
                macd_signal as MacdSignal,
                macd_histogram as MacdHistogram,
                rsi as Rsi,
                created_at as CreatedAt
            FROM analysis_indicators_stock_free
            WHERE stock_ticker_id = @StockTickerId
              AND indicator_time::date = @Date
            ORDER BY indicator_time";

        return await connection.QueryAsync<StockIndicator>(sql, new { StockTickerId = stockTickerId, Date = date });
    }
}
