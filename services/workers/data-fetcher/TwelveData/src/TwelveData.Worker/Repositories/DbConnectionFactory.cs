using System.Data;
using Microsoft.Extensions.Options;
using Npgsql;
using TwelveData.Worker.Configuration;

namespace TwelveData.Worker.Repositories;

public class DbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IOptions<DatabaseSettings> settings)
    {
        var baseConnectionString = settings.Value.DefaultConnection;
        
        // Configure connection for direct Supabase connection with bulk operation support
        var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
        {
            CommandTimeout = 120,  // Increased for bulk insert operations
            Timeout = 30,          // Connection timeout
            SslMode = SslMode.Require,
            Pooling = true,        // Enable local pooling for connection reuse
            MaxPoolSize = 10       // Limit pool size for direct connection
        };
        
        _connectionString = builder.ConnectionString;
    }

    public IDbConnection CreateConnection()
    {
        // Don't open here - let Dapper handle connection lifecycle
        return new NpgsqlConnection(_connectionString);
    }
}

