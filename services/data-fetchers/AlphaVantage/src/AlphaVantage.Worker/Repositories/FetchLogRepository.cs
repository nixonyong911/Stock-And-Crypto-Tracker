using Dapper;

namespace AlphaVantage.Worker.Repositories;

public class FetchLogRepository : IFetchLogRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public FetchLogRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<Guid> StartFetchLogAsync(Guid dataSourceId, string fetchType)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            INSERT INTO fetch_logs (data_source_id, fetch_type, status, started_at)
            VALUES (@DataSourceId, @FetchType, 'started', @StartedAt)
            RETURNING id";
        
        return await connection.ExecuteScalarAsync<Guid>(sql, new 
        { 
            DataSourceId = dataSourceId, 
            FetchType = fetchType, 
            StartedAt = DateTime.UtcNow 
        });
    }

    public async Task CompleteFetchLogAsync(Guid logId, int recordsFetched)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            UPDATE fetch_logs 
            SET status = 'completed', 
                records_fetched = @RecordsFetched, 
                completed_at = @CompletedAt
            WHERE id = @Id";
        
        await connection.ExecuteAsync(sql, new 
        { 
            Id = logId, 
            RecordsFetched = recordsFetched, 
            CompletedAt = DateTime.UtcNow 
        });
    }

    public async Task FailFetchLogAsync(Guid logId, string errorMessage)
    {
        using var connection = _connectionFactory.CreateConnection();
        
        const string sql = @"
            UPDATE fetch_logs 
            SET status = 'failed', 
                error_message = @ErrorMessage, 
                completed_at = @CompletedAt
            WHERE id = @Id";
        
        await connection.ExecuteAsync(sql, new 
        { 
            Id = logId, 
            ErrorMessage = errorMessage, 
            CompletedAt = DateTime.UtcNow 
        });
    }
}

