using Dapper;
using DataFetcher.Worker.Domain.Providers.Fred.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Fred.Repositories;

public class FredRepository : IFredRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<FredRepository> _logger;

    public FredRepository(IDbConnectionFactory connectionFactory, ILogger<FredRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<List<EconomicIndicator>> GetActiveIndicatorsAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT id as Id, series_id as SeriesId, category as Category, display_name as DisplayName,
                   bullish_when as BullishWhen,
                   COALESCE(display_mode, 'rate') as DisplayMode,
                   COALESCE(display_divisor, 1) as DisplayDivisor
            FROM analysis_economic_indicators
            WHERE is_active = true
            ORDER BY category, display_order";

        var result = await connection.QueryAsync<EconomicIndicator>(sql);
        return result.ToList();
    }

    public async Task<List<IndicatorStatus>> GetAllIndicatorStatusAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT
                series_id as SeriesId, display_name as DisplayName, category as Category,
                current_value as CurrentValue, current_observation_date as CurrentDate,
                previous_value as PreviousValue, previous_observation_date as PreviousDate,
                change_percent as ChangePercent, trend as Trend, current_signal as CurrentSignal,
                last_updated_at as LastUpdatedAt,
                COALESCE(display_mode, 'rate') as DisplayMode,
                COALESCE(display_divisor, 1) as DisplayDivisor,
                media_current_value as MediaCurrentValue,
                media_previous_value as MediaPreviousValue,
                last_release_date as LastReleaseDate
            FROM analysis_economic_indicators
            WHERE is_active = true
            ORDER BY category, display_order";

        var result = await connection.QueryAsync<IndicatorStatus>(sql);
        return result.ToList();
    }

    public async Task<EconomicIndicator?> GetIndicatorBySeriesIdAsync(string seriesId)
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT id as Id, series_id as SeriesId, category as Category, display_name as DisplayName,
                   bullish_when as BullishWhen,
                   COALESCE(display_mode, 'rate') as DisplayMode,
                   COALESCE(display_divisor, 1) as DisplayDivisor
            FROM analysis_economic_indicators
            WHERE series_id = @SeriesId AND is_active = true";

        return await connection.QueryFirstOrDefaultAsync<EconomicIndicator>(sql, new { SeriesId = seriesId });
    }

    public async Task UpsertIndicatorAsync(string seriesId, double value, DateTime date)
    {
        using var connection = _connectionFactory.CreateConnection();

        var currentObsDate = await connection.QueryFirstOrDefaultAsync<DateTime?>(
            "SELECT current_observation_date FROM analysis_economic_indicators WHERE series_id = @SeriesId",
            new { SeriesId = seriesId });

        if (currentObsDate.HasValue && date <= currentObsDate.Value)
            return;

        const string sql = @"
            UPDATE analysis_economic_indicators
            SET
                previous_value = current_value,
                previous_observation_date = current_observation_date,
                current_value = @Value,
                current_observation_date = @Date,
                change_value = CASE
                    WHEN current_value IS NULL THEN NULL
                    ELSE @Value - current_value
                END,
                change_percent = CASE
                    WHEN current_value IS NULL OR current_value = 0 THEN NULL
                    ELSE ((@Value - current_value) / current_value) * 100
                END,
                trend = CASE
                    WHEN current_value IS NULL THEN 'flat'
                    WHEN @Value > current_value THEN 'up'
                    WHEN @Value < current_value THEN 'down'
                    ELSE 'flat'
                END,
                current_signal = CASE
                    WHEN current_value IS NULL THEN 'neutral'
                    WHEN @Value > current_value AND bullish_when = 'up' THEN 'bullish'
                    WHEN @Value < current_value AND bullish_when = 'down' THEN 'bullish'
                    WHEN @Value = current_value THEN 'neutral'
                    ELSE 'bearish'
                END,
                last_updated_at = NOW()
            WHERE series_id = @SeriesId";

        var rows = await connection.ExecuteAsync(sql, new { SeriesId = seriesId, Value = value, Date = date });
        if (rows == 0)
            _logger.LogWarning("Indicator {SeriesId} not found for update", seriesId);
    }

    public async Task UpsertIndicatorWithMediaAsync(
        string seriesId, double value, DateTime date,
        double? mediaValue, double? yoyValue, DateTime? yoyDate, DateTime? lastReleaseDate)
    {
        using var connection = _connectionFactory.CreateConnection();

        var currentObsDate = await connection.QueryFirstOrDefaultAsync<DateTime?>(
            "SELECT current_observation_date FROM analysis_economic_indicators WHERE series_id = @SeriesId",
            new { SeriesId = seriesId });

        if (lastReleaseDate.HasValue)
        {
            await connection.ExecuteAsync(
                "UPDATE analysis_economic_indicators SET last_release_date = @LastReleaseDate WHERE series_id = @SeriesId",
                new { SeriesId = seriesId, LastReleaseDate = lastReleaseDate });
        }

        if (currentObsDate.HasValue && date <= currentObsDate.Value)
            return;

        const string sql = @"
            UPDATE analysis_economic_indicators
            SET
                previous_value = current_value,
                previous_observation_date = current_observation_date,
                media_previous_value = media_current_value,
                current_value = @Value,
                current_observation_date = @Date,
                media_current_value = @MediaValue,
                yoy_observation_value = COALESCE(@YoyValue, yoy_observation_value),
                yoy_observation_date = COALESCE(@YoyDate, yoy_observation_date),
                change_value = CASE
                    WHEN media_current_value IS NULL THEN NULL
                    ELSE @MediaValue - media_current_value
                END,
                change_percent = CASE
                    WHEN media_current_value IS NULL OR media_current_value = 0 THEN NULL
                    ELSE ((@MediaValue - media_current_value) / ABS(media_current_value)) * 100
                END,
                trend = CASE
                    WHEN media_current_value IS NULL THEN 'flat'
                    WHEN @MediaValue > media_current_value THEN 'up'
                    WHEN @MediaValue < media_current_value THEN 'down'
                    ELSE 'flat'
                END,
                current_signal = CASE
                    WHEN media_current_value IS NULL THEN 'neutral'
                    WHEN @MediaValue > media_current_value AND bullish_when = 'up' THEN 'bullish'
                    WHEN @MediaValue < media_current_value AND bullish_when = 'down' THEN 'bullish'
                    WHEN @MediaValue = media_current_value THEN 'neutral'
                    ELSE 'bearish'
                END,
                last_updated_at = NOW()
            WHERE series_id = @SeriesId";

        var rows = await connection.ExecuteAsync(sql, new
        {
            SeriesId = seriesId,
            Value = value,
            Date = date,
            MediaValue = mediaValue,
            YoyValue = yoyValue,
            YoyDate = yoyDate
        });

        if (rows == 0)
            _logger.LogWarning("Indicator {SeriesId} not found for media update", seriesId);
    }

    public async Task UpsertReleaseCalendarAsync(ReleaseCalendarEntry entry)
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            INSERT INTO analysis_release_calendar (
                series_id, release_id, release_name,
                next_release_date, following_release_date,
                release_frequency, release_link, last_synced_at
            ) VALUES (@SeriesId, @ReleaseId, @ReleaseName, @NextReleaseDate, @FollowingReleaseDate, @ReleaseFrequency, @ReleaseLink, NOW())
            ON CONFLICT (series_id) DO UPDATE SET
                release_id = EXCLUDED.release_id,
                release_name = EXCLUDED.release_name,
                next_release_date = EXCLUDED.next_release_date,
                following_release_date = EXCLUDED.following_release_date,
                release_frequency = EXCLUDED.release_frequency,
                release_link = EXCLUDED.release_link,
                last_synced_at = NOW()";

        await connection.ExecuteAsync(sql, new
        {
            entry.SeriesId,
            entry.ReleaseId,
            entry.ReleaseName,
            entry.NextReleaseDate,
            entry.FollowingReleaseDate,
            entry.ReleaseFrequency,
            entry.ReleaseLink
        });
    }

    public async Task<List<ReleaseCalendarEntry>> GetAllReleaseCalendarAsync()
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT
                rc.series_id as SeriesId, rc.release_id as ReleaseId, rc.release_name as ReleaseName,
                rc.next_release_date as NextReleaseDate, rc.following_release_date as FollowingReleaseDate,
                rc.release_frequency as ReleaseFrequency, rc.release_link as ReleaseLink, rc.last_synced_at as LastSyncedAt
            FROM analysis_release_calendar rc
            JOIN analysis_economic_indicators ei ON rc.series_id = ei.series_id
            WHERE ei.is_active = true
            ORDER BY rc.next_release_date ASC NULLS LAST";

        var result = await connection.QueryAsync<ReleaseCalendarEntry>(sql);
        return result.ToList();
    }

    public async Task<List<ReleaseCalendarEntry>> GetUpcomingReleasesAsync(int days)
    {
        using var connection = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT
                rc.series_id as SeriesId, rc.release_id as ReleaseId, rc.release_name as ReleaseName,
                rc.next_release_date as NextReleaseDate, rc.following_release_date as FollowingReleaseDate,
                rc.release_frequency as ReleaseFrequency, rc.release_link as ReleaseLink, rc.last_synced_at as LastSyncedAt
            FROM analysis_release_calendar rc
            JOIN analysis_economic_indicators ei ON rc.series_id = ei.series_id
            WHERE ei.is_active = true
              AND rc.next_release_date IS NOT NULL
              AND rc.next_release_date <= CURRENT_DATE + @Days
            ORDER BY rc.next_release_date ASC";

        var result = await connection.QueryAsync<ReleaseCalendarEntry>(sql, new { Days = days });
        return result.ToList();
    }
}
