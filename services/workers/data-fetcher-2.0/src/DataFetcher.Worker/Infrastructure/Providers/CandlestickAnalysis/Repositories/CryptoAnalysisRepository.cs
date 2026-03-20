using System.Text.Json;
using Dapper;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

public class CryptoAnalysisRepository : ICryptoAnalysisRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<CryptoAnalysisRepository> _logger;

    public CryptoAnalysisRepository(IDbConnectionFactory connectionFactory, ILogger<CryptoAnalysisRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task UpsertAnalysisAsync(CryptoAnalysisResult result)
    {
        using var connection = _connectionFactory.CreateConnection();

        var patternsJson = JsonSerializer.Serialize(result.DetectedPatterns);

        const string sql = @"
            INSERT INTO analysis_crypto_candlestick_pattern
                (crypto_ticker_id, analysis_date, timeframe, is_confirmed, confidence,
                 daily_open, daily_high, daily_low, daily_close, daily_volume,
                 body_size, range_size, upper_wick, lower_wick, is_bullish, detected_patterns,
                 candles_aggregated, analysis_version, updated_at)
            VALUES
                (@CryptoTickerId, @AnalysisDate, @Timeframe, @IsConfirmed, @Confidence,
                 @DailyOpen, @DailyHigh, @DailyLow, @DailyClose, @DailyVolume,
                 @BodySize, @RangeSize, @UpperWick, @LowerWick, @IsBullish, @DetectedPatterns::jsonb,
                 @CandlesAggregated, @AnalysisVersion, CURRENT_TIMESTAMP)
            ON CONFLICT (crypto_ticker_id, analysis_date, timeframe)
            DO UPDATE SET
                is_confirmed = EXCLUDED.is_confirmed,
                confidence = EXCLUDED.confidence,
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

        await connection.ExecuteAsync(sql, new
        {
            result.CryptoTickerId,
            AnalysisDate = result.AnalysisDate,
            result.Timeframe,
            result.IsConfirmed,
            result.Confidence,
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
    }

    public async Task<IEnumerable<CryptoAnalysisResult>> GetAnalysisAsync(string symbol, DateOnly? startDate, DateOnly? endDate)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                a.crypto_ticker_id as CryptoTickerId,
                t.symbol as Symbol,
                a.analysis_date as AnalysisDate,
                a.daily_open as DailyOpen,
                a.daily_high as DailyHigh,
                a.daily_low as DailyLow,
                a.daily_close as DailyClose,
                a.daily_volume as DailyVolume,
                a.body_size as BodySize,
                a.range_size as RangeSize,
                a.upper_wick as UpperWick,
                a.lower_wick as LowerWick,
                a.is_bullish as IsBullish,
                a.detected_patterns::text as DetectedPatternsJson,
                a.candles_aggregated as CandlesAggregated,
                a.analysis_version as AnalysisVersion,
                a.timeframe as Timeframe,
                a.is_confirmed as IsConfirmed,
                a.confidence as Confidence
            FROM analysis_crypto_candlestick_pattern a
            JOIN crypto_tickers t ON t.id = a.crypto_ticker_id
            WHERE t.symbol = @Symbol
              AND (@StartDate IS NULL OR a.analysis_date >= @StartDate)
              AND (@EndDate IS NULL OR a.analysis_date <= @EndDate)
            ORDER BY a.analysis_date DESC";

        var rows = await connection.QueryAsync<CryptoAnalysisDbRow>(sql, new
        {
            Symbol = symbol,
            StartDate = startDate,
            EndDate = endDate
        });

        return rows.Select(row =>
        {
            var result = new CryptoAnalysisResult
            {
                CryptoTickerId = row.CryptoTickerId,
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
                CandlesAggregated = row.CandlesAggregated,
                AnalysisVersion = row.AnalysisVersion,
                Timeframe = row.Timeframe,
                IsConfirmed = row.IsConfirmed,
                Confidence = row.Confidence
            };

            if (!string.IsNullOrEmpty(row.DetectedPatternsJson))
            {
                result.DetectedPatterns = JsonSerializer.Deserialize<List<CandlestickPattern>>(row.DetectedPatternsJson) ?? new();
            }

            return result;
        });
    }

    public async Task<bool> ExistsAsync(int cryptoTickerId, DateOnly date)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = "SELECT EXISTS(SELECT 1 FROM analysis_crypto_candlestick_pattern WHERE crypto_ticker_id = @CryptoTickerId AND analysis_date = @Date)";

        return await connection.QuerySingleAsync<bool>(sql, new { CryptoTickerId = cryptoTickerId, Date = date });
    }

    public async Task<IEnumerable<DateOnly>> GetAnalyzedDatesAsync(int cryptoTickerId, DateOnly startDate, DateOnly endDate)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT analysis_date
            FROM analysis_crypto_candlestick_pattern
            WHERE crypto_ticker_id = @CryptoTickerId
              AND analysis_date >= @StartDate
              AND analysis_date <= @EndDate
            ORDER BY analysis_date";

        var dates = await connection.QueryAsync<DateTime>(sql, new
        {
            CryptoTickerId = cryptoTickerId,
            StartDate = startDate,
            EndDate = endDate
        });

        return dates.Select(d => DateOnly.FromDateTime(d));
    }
}
