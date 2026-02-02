using Dapper;
using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Repositories;

/// <summary>
/// Repository implementation for earnings release schedule operations.
/// </summary>
public class EarningsRepository : IEarningsRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<EarningsRepository> _logger;

    public EarningsRepository(IDbConnectionFactory connectionFactory, ILogger<EarningsRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task UpsertAsync(EarningsReleaseSchedule data)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_earnings_release_schedule (
                stock_ticker_id, earnings_date, is_estimate,
                eps_estimate, revenue_estimate, eps_actual, revenue_actual,
                eps_surprise, eps_surprise_percent, updated_at
            ) VALUES (
                @StockTickerId, @EarningsDate, @IsEstimate,
                @EpsEstimate, @RevenueEstimate, @EpsActual, @RevenueActual,
                @EpsSurprise, @EpsSurprisePercent, NOW()
            )
            ON CONFLICT (stock_ticker_id, earnings_date)
            DO UPDATE SET
                is_estimate = EXCLUDED.is_estimate,
                eps_estimate = EXCLUDED.eps_estimate,
                revenue_estimate = EXCLUDED.revenue_estimate,
                eps_actual = COALESCE(EXCLUDED.eps_actual, analysis_earnings_release_schedule.eps_actual),
                revenue_actual = COALESCE(EXCLUDED.revenue_actual, analysis_earnings_release_schedule.revenue_actual),
                eps_surprise = COALESCE(EXCLUDED.eps_surprise, analysis_earnings_release_schedule.eps_surprise),
                eps_surprise_percent = COALESCE(EXCLUDED.eps_surprise_percent, analysis_earnings_release_schedule.eps_surprise_percent),
                updated_at = NOW()";

        await connection.ExecuteAsync(sql, new
        {
            data.StockTickerId,
            EarningsDate = data.EarningsDate.ToDateTime(TimeOnly.MinValue),
            data.IsEstimate,
            data.EpsEstimate,
            data.RevenueEstimate,
            data.EpsActual,
            data.RevenueActual,
            data.EpsSurprise,
            data.EpsSurprisePercent
        });

        _logger.LogDebug("Upserted earnings for ticker {TickerId} on {Date}", data.StockTickerId, data.EarningsDate);
    }

    /// <inheritdoc />
    public async Task<IEnumerable<int>> GetTickersWithRecentEarningsAsync(int withinDays)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT DISTINCT stock_ticker_id
            FROM analysis_earnings_release_schedule
            WHERE earnings_date >= CURRENT_DATE - @Days
              AND earnings_date <= CURRENT_DATE
              AND is_estimate = false";

        return await connection.QueryAsync<int>(sql, new { Days = withinDays });
    }

    /// <inheritdoc />
    public async Task<EarningsReleaseSchedule?> GetUpcomingEarningsAsync(int stockTickerId)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                stock_ticker_id as StockTickerId,
                earnings_date as EarningsDate,
                is_estimate as IsEstimate,
                eps_estimate as EpsEstimate,
                revenue_estimate as RevenueEstimate,
                eps_actual as EpsActual,
                revenue_actual as RevenueActual,
                eps_surprise as EpsSurprise,
                eps_surprise_percent as EpsSurprisePercent,
                created_at as CreatedAt,
                updated_at as UpdatedAt
            FROM analysis_earnings_release_schedule
            WHERE stock_ticker_id = @StockTickerId
              AND earnings_date >= CURRENT_DATE
            ORDER BY earnings_date ASC
            LIMIT 1";

        return await connection.QueryFirstOrDefaultAsync<EarningsReleaseSchedule>(sql, new { StockTickerId = stockTickerId });
    }

    /// <inheritdoc />
    public async Task<EarningsReleaseSchedule?> GetByTickerAndDateAsync(int stockTickerId, DateOnly earningsDate)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                stock_ticker_id as StockTickerId,
                earnings_date as EarningsDate,
                is_estimate as IsEstimate,
                eps_estimate as EpsEstimate,
                revenue_estimate as RevenueEstimate,
                eps_actual as EpsActual,
                revenue_actual as RevenueActual,
                eps_surprise as EpsSurprise,
                eps_surprise_percent as EpsSurprisePercent,
                created_at as CreatedAt,
                updated_at as UpdatedAt
            FROM analysis_earnings_release_schedule
            WHERE stock_ticker_id = @StockTickerId
              AND earnings_date = @EarningsDate";

        return await connection.QueryFirstOrDefaultAsync<EarningsReleaseSchedule>(sql,
            new { StockTickerId = stockTickerId, EarningsDate = earningsDate.ToDateTime(TimeOnly.MinValue) });
    }
}
