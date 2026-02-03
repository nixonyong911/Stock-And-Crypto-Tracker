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
                fs.schedule_time as ScheduleTime,
                fs.schedule_timezone as ScheduleTimezone,
                fs.is_enabled as IsEnabled,
                fs.last_run_at as LastRunAt,
                fs.last_run_status as LastRunStatus,
                fs.last_run_message as LastRunMessage,
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
                fs.schedule_time as ScheduleTime,
                fs.schedule_timezone as ScheduleTimezone,
                fs.is_enabled as IsEnabled,
                fs.last_run_at as LastRunAt,
                fs.last_run_status as LastRunStatus,
                fs.last_run_message as LastRunMessage,
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
}
