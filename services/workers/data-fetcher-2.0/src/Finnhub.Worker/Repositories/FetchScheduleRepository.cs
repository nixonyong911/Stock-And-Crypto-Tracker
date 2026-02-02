using Dapper;
using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Repositories;

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
                fs.schedule_time as ScheduleTimeUtc,
                fs.schedule_timezone as ScheduleTimezone,
                fs.is_enabled as IsEnabled,
                fs.last_run_at as LastRunAt,
                fs.created_at as CreatedAt,
                fs.updated_at as UpdatedAt
            FROM worker_fetch_schedules fs
            JOIN lookup_data_sources ds ON fs.data_source_id = ds.id
            WHERE ds.name = @DataSourceName AND fs.is_enabled = true
            LIMIT 1";

        return await connection.QueryFirstOrDefaultAsync<FetchSchedule>(sql, new { DataSourceName = dataSourceName });
    }

    /// <inheritdoc />
    public async Task UpdateLastRunAsync(int scheduleId)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            UPDATE worker_fetch_schedules
            SET last_run_at = NOW(), updated_at = NOW()
            WHERE id = @ScheduleId";

        await connection.ExecuteAsync(sql, new { ScheduleId = scheduleId });
        _logger.LogDebug("Updated last run time for schedule {ScheduleId}", scheduleId);
    }
}
