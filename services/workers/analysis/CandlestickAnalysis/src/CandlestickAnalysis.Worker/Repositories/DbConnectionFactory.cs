using System.Data;
using Microsoft.Extensions.Options;
using Npgsql;
using CandlestickAnalysis.Worker.Configuration;

namespace CandlestickAnalysis.Worker.Repositories;

/// <summary>
/// Factory for creating PostgreSQL database connections.
/// </summary>
public class DbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IOptions<DatabaseSettings> settings)
    {
        var baseConnectionString = settings.Value.DefaultConnection;
        
        // Add timeout and SSL settings for Supabase connections
        // Multiplexing=false is required for Npgsql 8.0 + Supavisor compatibility
        // to prevent "Exception while reading from stream" during multi-row queries
        var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
        {
            CommandTimeout = 30,
            Timeout = 15,
            SslMode = SslMode.Require,
            Pooling = false,       // Disable local pooling since Supabase has its own pooler
            Multiplexing = false   // Required for Supavisor - prevents stream read errors
        };
        
        _connectionString = builder.ConnectionString;
    }

    public IDbConnection CreateConnection()
    {
        // Don't open here - let Dapper handle connection lifecycle
        return new NpgsqlConnection(_connectionString);
    }
}

