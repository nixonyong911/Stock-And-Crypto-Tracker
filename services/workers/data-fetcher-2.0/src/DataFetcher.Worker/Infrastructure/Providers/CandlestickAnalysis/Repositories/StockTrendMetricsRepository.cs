using Dapper;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

public class StockTrendMetricsRepository : IStockTrendMetricsRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<StockTrendMetricsRepository> _logger;

    public StockTrendMetricsRepository(IDbConnectionFactory connectionFactory, ILogger<StockTrendMetricsRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task UpsertAsync(StockTrendMetrics metrics)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_stock_trend_metrics
                (stock_ticker_id, week_52_high, week_52_low,
                 week_52_high_date, week_52_low_date,
                 sma_50, sma_200, ema_50, coverage_days, computed_at)
            VALUES
                (@StockTickerId, @Week52High, @Week52Low,
                 @Week52HighDate, @Week52LowDate,
                 @Sma50, @Sma200, @Ema50, @CoverageDays, NOW())
            ON CONFLICT (stock_ticker_id)
            DO UPDATE SET
                week_52_high = EXCLUDED.week_52_high,
                week_52_low = EXCLUDED.week_52_low,
                week_52_high_date = EXCLUDED.week_52_high_date,
                week_52_low_date = EXCLUDED.week_52_low_date,
                sma_50 = EXCLUDED.sma_50,
                sma_200 = EXCLUDED.sma_200,
                ema_50 = EXCLUDED.ema_50,
                coverage_days = EXCLUDED.coverage_days,
                computed_at = NOW()";

        await connection.ExecuteAsync(sql, metrics);
        _logger.LogDebug("Upserted trend metrics for stock ticker {TickerId}", metrics.StockTickerId);
    }

    /// <inheritdoc />
    public async Task<IReadOnlySet<int>> GetComputedSinceAsync(DateTime sinceUtc)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT stock_ticker_id
            FROM analysis_stock_trend_metrics
            WHERE computed_at >= @SinceUtc";

        var ids = await connection.QueryAsync<int>(sql, new { SinceUtc = sinceUtc });
        return ids.ToHashSet();
    }

    /// <inheritdoc />
    public async Task<StockTrendMetrics?> GetLatestAsync(int stockTickerId, int maxAgeDays)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                stock_ticker_id AS StockTickerId,
                week_52_high AS Week52High,
                week_52_low AS Week52Low,
                week_52_high_date AS Week52HighDate,
                week_52_low_date AS Week52LowDate,
                sma_50 AS Sma50,
                sma_200 AS Sma200,
                ema_50 AS Ema50,
                coverage_days AS CoverageDays,
                computed_at AS ComputedAt
            FROM analysis_stock_trend_metrics
            WHERE stock_ticker_id = @StockTickerId
              AND computed_at >= NOW() - make_interval(days => @MaxAgeDays)";

        return await connection.QueryFirstOrDefaultAsync<StockTrendMetrics>(
            sql, new { StockTickerId = stockTickerId, MaxAgeDays = maxAgeDays });
    }
}
