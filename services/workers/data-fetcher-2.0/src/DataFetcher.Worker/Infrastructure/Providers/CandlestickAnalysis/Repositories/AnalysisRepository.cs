using System.Data.Common;
using System.Text.Json;
using Dapper;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

/// <summary>
/// Repository for writing and reading candlestick analysis results.
/// </summary>
public class AnalysisRepository : IAnalysisRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<AnalysisRepository> _logger;

    public AnalysisRepository(
        IDbConnectionFactory connectionFactory,
        ILogger<AnalysisRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task UpsertAnalysisAsync(AnalysisResult result)
    {
        var patternsJson = JsonSerializer.Serialize(result.DetectedPatterns);

        const string sql = @"
            INSERT INTO analysis_stock_candlestick_pattern (
                stock_ticker_id, analysis_date,
                daily_open, daily_high, daily_low, daily_close, daily_volume,
                body_size, range_size, upper_wick, lower_wick, is_bullish,
                detected_patterns, candles_aggregated, analysis_version,
                created_at, updated_at
            )
            VALUES (
                @StockTickerId, @AnalysisDate,
                @DailyOpen, @DailyHigh, @DailyLow, @DailyClose, @DailyVolume,
                @BodySize, @RangeSize, @UpperWick, @LowerWick, @IsBullish,
                @DetectedPatterns::jsonb, @CandlesAggregated, @AnalysisVersion,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (stock_ticker_id, analysis_date)
            DO UPDATE SET
                daily_open = EXCLUDED.daily_open,
                daily_high = EXCLUDED.daily_high,
                daily_low = EXCLUDED.daily_low,
                daily_close = EXCLUDED.daily_close,
                daily_volume = EXCLUDED.daily_volume,
                body_size = EXCLUDED.body_size,
                range_size = EXCLUDED.range_size,
                upper_wick = EXCLUDED.upper_wick,
                lower_wick = EXCLUDED.lower_wick,
                is_bullish = EXCLUDED.is_bullish,
                detected_patterns = EXCLUDED.detected_patterns,
                candles_aggregated = EXCLUDED.candles_aggregated,
                analysis_version = EXCLUDED.analysis_version,
                updated_at = CURRENT_TIMESTAMP";

        using var connection = _connectionFactory.CreateConnection();
        await connection.ExecuteAsync(sql, new
        {
            result.StockTickerId,
            AnalysisDate = result.AnalysisDate,
            result.DailyOpen,
            result.DailyHigh,
            result.DailyLow,
            result.DailyClose,
            result.DailyVolume,
            result.BodySize,
            result.RangeSize,
            result.UpperWick,
            result.LowerWick,
            result.IsBullish,
            DetectedPatterns = patternsJson,
            result.CandlesAggregated,
            result.AnalysisVersion
        });

        _logger.LogDebug("Upserted analysis for ticker {TickerId} on {Date} with {PatternCount} patterns",
            result.StockTickerId, result.AnalysisDate, result.DetectedPatterns.Count);
    }

    public async Task<IEnumerable<AnalysisResult>> GetAnalysisAsync(string symbol, DateOnly? startDate, DateOnly? endDate)
    {
        var sql = @"
            SELECT
                a.stock_ticker_id AS StockTickerId,
                st.symbol AS Symbol,
                a.analysis_date AS AnalysisDate,
                a.daily_open AS DailyOpen,
                a.daily_high AS DailyHigh,
                a.daily_low AS DailyLow,
                a.daily_close AS DailyClose,
                a.daily_volume AS DailyVolume,
                a.body_size AS BodySize,
                a.range_size AS RangeSize,
                a.upper_wick AS UpperWick,
                a.lower_wick AS LowerWick,
                a.is_bullish AS IsBullish,
                a.detected_patterns::text AS DetectedPatternsJson,
                a.candles_aggregated AS CandlesAggregated,
                a.analysis_version AS AnalysisVersion
            FROM analysis_stock_candlestick_pattern a
            JOIN stock_tickers st ON a.stock_ticker_id = st.id
            WHERE st.symbol = @Symbol";

        if (startDate.HasValue)
            sql += " AND a.analysis_date >= @StartDate";
        if (endDate.HasValue)
            sql += " AND a.analysis_date <= @EndDate";

        sql += " ORDER BY a.analysis_date DESC";

        using var connection = (DbConnection)_connectionFactory.CreateConnection();
        await connection.OpenAsync();

        var rows = await connection.QueryAsync<AnalysisDbRow>(sql, new
        {
            Symbol = symbol,
            StartDate = startDate,
            EndDate = endDate
        });
        var rowList = rows.AsList();

        return rowList.Select(row => new AnalysisResult
        {
            StockTickerId = row.StockTickerId,
            Symbol = row.Symbol,
            AnalysisDate = DateOnly.FromDateTime(row.AnalysisDate),
            DailyOpen = row.DailyOpen,
            DailyHigh = row.DailyHigh,
            DailyLow = row.DailyLow,
            DailyClose = row.DailyClose,
            DailyVolume = row.DailyVolume,
            BodySize = row.BodySize,
            RangeSize = row.RangeSize,
            UpperWick = row.UpperWick,
            LowerWick = row.LowerWick,
            IsBullish = row.IsBullish,
            DetectedPatterns = string.IsNullOrEmpty(row.DetectedPatternsJson)
                ? new List<CandlestickPattern>()
                : JsonSerializer.Deserialize<List<CandlestickPattern>>(row.DetectedPatternsJson) ?? new(),
            CandlesAggregated = row.CandlesAggregated,
            AnalysisVersion = row.AnalysisVersion
        });
    }

    public async Task<bool> ExistsAsync(int stockTickerId, DateOnly date)
    {
        const string sql = @"
            SELECT EXISTS(
                SELECT 1
                FROM analysis_stock_candlestick_pattern
                WHERE stock_ticker_id = @StockTickerId
                  AND analysis_date = @AnalysisDate
            )";

        using var connection = _connectionFactory.CreateConnection();
        return await connection.ExecuteScalarAsync<bool>(sql, new
        {
            StockTickerId = stockTickerId,
            AnalysisDate = date
        });
    }

    public async Task<IEnumerable<DateOnly>> GetAnalyzedDatesAsync(int stockTickerId, DateOnly startDate, DateOnly endDate)
    {
        const string sql = @"
            SELECT analysis_date
            FROM analysis_stock_candlestick_pattern
            WHERE stock_ticker_id = @StockTickerId
              AND analysis_date >= @StartDate
              AND analysis_date <= @EndDate
            ORDER BY analysis_date ASC";

        using var connection = _connectionFactory.CreateConnection();
        var dates = await connection.QueryAsync<DateTime>(sql, new
        {
            StockTickerId = stockTickerId,
            StartDate = startDate,
            EndDate = endDate
        });

        return dates.Select(d => DateOnly.FromDateTime(d));
    }
}
