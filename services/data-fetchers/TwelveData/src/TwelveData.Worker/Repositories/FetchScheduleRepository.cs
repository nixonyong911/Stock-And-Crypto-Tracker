using Dapper;
using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public class FetchScheduleRepository : IFetchScheduleRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public FetchScheduleRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            SELECT 
                fs.id as Id,
                fs.data_source_id as DataSourceId,
                fs.name as Name,
                fs.description as Description,
                fs.schedule_time_utc as ScheduleTimeUtc,
                fs.is_enabled as IsEnabled,
                fs.fetch_config as FetchConfig,
                fs.last_run_at as LastRunAt,
                fs.last_run_status as LastRunStatus,
                fs.last_run_message as LastRunMessage,
                fs.created_at as CreatedAt,
                fs.updated_at as UpdatedAt
            FROM fetch_schedules fs
            INNER JOIN data_sources ds ON fs.data_source_id = ds.id
            WHERE ds.name = @DataSourceName 
              AND fs.is_enabled = true
              AND ds.is_active = true";
        
        return await connection.QueryFirstOrDefaultAsync<FetchSchedule>(sql, new { DataSourceName = dataSourceName });
    }

    public async Task UpdateLastRunAsync(int scheduleId, string status, string? message)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            UPDATE fetch_schedules 
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
    }
}




