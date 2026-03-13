using Dapper;
using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

/// <summary>
/// Repository implementation for fetch schedule operations.
/// </summary>
public class FetchScheduleRepository : IFetchScheduleRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<FetchScheduleRepository> _logger;

    public FetchScheduleRepository(IDbConnectionFactory connectionFactory, ILogger<FetchScheduleRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                fs.id as Id,
                fs.data_source_id as DataSourceId,
                fs.name as Name,
                fs.description as Description,
                fs.schedule_time as ScheduleTime,
                fs.schedule_timezone as ScheduleTimezone,
                fs.is_enabled as IsEnabled,
                fs.fetch_config::text as FetchConfig,
                fs.last_run_at as LastRunAt,
                fs.last_run_status as LastRunStatus,
                fs.last_run_message as LastRunMessage,
                fs.interval_minutes as IntervalMinutes,
                fs.offset_minutes as OffsetMinutes,
                fs.created_at as CreatedAt,
                fs.updated_at as UpdatedAt
            FROM worker_fetch_schedules fs
            JOIN lookup_data_sources ds ON fs.data_source_id = ds.id
            WHERE ds.name = @DataSourceName AND fs.is_enabled = true
            LIMIT 1";

        return await connection.QueryFirstOrDefaultAsync<FetchSchedule>(sql, new { DataSourceName = dataSourceName });
    }

    /// <inheritdoc />
    public async Task<FetchSchedule?> GetScheduleByNameAsync(string scheduleName)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                fs.id as Id,
                fs.data_source_id as DataSourceId,
                fs.name as Name,
                fs.description as Description,
                fs.schedule_time as ScheduleTime,
                fs.schedule_timezone as ScheduleTimezone,
                fs.is_enabled as IsEnabled,
                fs.fetch_config::text as FetchConfig,
                fs.last_run_at as LastRunAt,
                fs.last_run_status as LastRunStatus,
                fs.last_run_message as LastRunMessage,
                fs.interval_minutes as IntervalMinutes,
                fs.offset_minutes as OffsetMinutes,
                fs.created_at as CreatedAt,
                fs.updated_at as UpdatedAt
            FROM worker_fetch_schedules fs
            WHERE fs.name = @ScheduleName AND fs.is_enabled = true
            LIMIT 1";

        return await connection.QueryFirstOrDefaultAsync<FetchSchedule>(sql, new { ScheduleName = scheduleName });
    }

    /// <inheritdoc />
    public async Task UpdateLastRunAsync(int scheduleId, string status, string? message)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            UPDATE worker_fetch_schedules
            SET last_run_at = @LastRunAt,
                last_run_status = @Status,
                last_run_message = @Message,
                updated_at = @UpdatedAt
            WHERE id = @ScheduleId";

        await connection.ExecuteAsync(sql, new
        {
            ScheduleId = scheduleId,
            LastRunAt = DateTime.UtcNow,
            Status = status,
            Message = message,
            UpdatedAt = DateTime.UtcNow
        });

        _logger.LogDebug("Updated last run for schedule {ScheduleId}: {Status}", scheduleId, status);
    }

    /// <inheritdoc />
    public async Task UpdateFetchConfigAsync(int scheduleId, string fetchConfigJson)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            UPDATE worker_fetch_schedules
            SET fetch_config = @FetchConfig::jsonb,
                updated_at = @UpdatedAt
            WHERE id = @ScheduleId";

        await connection.ExecuteAsync(sql, new
        {
            ScheduleId = scheduleId,
            FetchConfig = fetchConfigJson,
            UpdatedAt = DateTime.UtcNow
        });
    }

    /// <inheritdoc />
    public async Task LogExecutionAsync(int scheduleId, string status, string? message, int? durationMs, DateTime startedAt)
    {
        try
        {
            using var connection = _connectionFactory.CreateConnection();

            const string sql = @"
                INSERT INTO worker_execution_log (schedule_id, status, message, duration_ms, started_at)
                VALUES (@ScheduleId, @Status, @Message, @DurationMs, @StartedAt);
                DELETE FROM worker_execution_log
                WHERE id IN (
                    SELECT id FROM worker_execution_log
                    WHERE schedule_id = @ScheduleId
                    ORDER BY completed_at DESC
                    OFFSET 100
                )";

            await connection.ExecuteAsync(sql, new
            {
                ScheduleId = scheduleId,
                Status = status,
                Message = message,
                DurationMs = durationMs,
                StartedAt = startedAt
            });

            _logger.LogDebug("Logged execution for schedule {ScheduleId}: {Status} ({DurationMs}ms)", scheduleId, status, durationMs);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to log execution for schedule {ScheduleId} (non-fatal)", scheduleId);
        }
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<FetchSchedule>> GetAllSchedulesAsync()
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                fs.id as Id,
                fs.data_source_id as DataSourceId,
                fs.name as Name,
                fs.description as Description,
                fs.schedule_time as ScheduleTime,
                fs.schedule_timezone as ScheduleTimezone,
                fs.is_enabled as IsEnabled,
                fs.fetch_config::text as FetchConfig,
                fs.last_run_at as LastRunAt,
                fs.last_run_status as LastRunStatus,
                fs.last_run_message as LastRunMessage,
                fs.interval_minutes as IntervalMinutes,
                fs.offset_minutes as OffsetMinutes,
                fs.created_at as CreatedAt,
                fs.updated_at as UpdatedAt
            FROM worker_fetch_schedules fs
            LEFT JOIN worker_registry wr ON fs.worker_id = wr.id
            WHERE wr.name = 'data-fetcher-2.0'
               OR fs.worker_id IS NULL
            ORDER BY fs.name";

        var results = await connection.QueryAsync<FetchSchedule>(sql);
        return results.ToList().AsReadOnly();
    }

    /// <inheritdoc />
    public async Task<FetchSchedule?> ToggleScheduleAsync(int scheduleId)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            UPDATE worker_fetch_schedules
            SET is_enabled = NOT is_enabled,
                updated_at = @UpdatedAt
            WHERE id = @ScheduleId
            RETURNING
                id as Id,
                data_source_id as DataSourceId,
                name as Name,
                description as Description,
                schedule_time as ScheduleTime,
                schedule_timezone as ScheduleTimezone,
                is_enabled as IsEnabled,
                fetch_config::text as FetchConfig,
                last_run_at as LastRunAt,
                last_run_status as LastRunStatus,
                last_run_message as LastRunMessage,
                interval_minutes as IntervalMinutes,
                offset_minutes as OffsetMinutes,
                created_at as CreatedAt,
                updated_at as UpdatedAt";

        return await connection.QueryFirstOrDefaultAsync<FetchSchedule>(sql, new
        {
            ScheduleId = scheduleId,
            UpdatedAt = DateTime.UtcNow
        });
    }
}
