using System.Data;
using DataFetcher.Worker.Configuration;
using Microsoft.Extensions.Options;
using Npgsql;

namespace DataFetcher.Worker.Infrastructure.Common;

/// <summary>
/// Factory for creating PostgreSQL database connections.
/// </summary>
public class DbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IOptions<DatabaseSettings> settings)
    {
        var builder = new NpgsqlConnectionStringBuilder(settings.Value.DefaultConnection)
        {
            CommandTimeout = 120,
            Timeout = 30,
            Pooling = true,
            MaxPoolSize = 10,
            Multiplexing = false,
            KeepAlive = 60,
            ConnectionIdleLifetime = 300,
            ConnectionLifetime = 600,
        };
        _connectionString = builder.ConnectionString;
    }

    /// <inheritdoc />
    public IDbConnection CreateConnection()
    {
        return new NpgsqlConnection(_connectionString);
    }
}
