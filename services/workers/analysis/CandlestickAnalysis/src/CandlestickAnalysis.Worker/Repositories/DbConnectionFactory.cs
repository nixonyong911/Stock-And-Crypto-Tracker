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
        // These settings are optimized for Supavisor (Supabase connection pooler) compatibility
        var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
        {
            CommandTimeout = 60,       // Increase command timeout for larger result sets
            Timeout = 30,              // Increase connection timeout
            SslMode = SslMode.Require,
            Pooling = false,           // Disable local pooling since Supabase has its own pooler
            Multiplexing = false,      // Required for Supavisor - prevents stream read errors
            Enlist = false,            // Disable distributed transactions for pooler compatibility
            KeepAlive = 30,            // Send keepalive every 30 seconds
            TcpKeepAlive = true,       // Enable TCP keepalive
            ReadBufferSize = 8192,     // Increase read buffer size
            WriteBufferSize = 8192,    // Increase write buffer size
            NoResetOnClose = true      // Don't send DISCARD ALL on close (for pooler compatibility)
        };
        
        _connectionString = builder.ConnectionString;
    }

    public IDbConnection CreateConnection()
    {
        // Don't open here - let Dapper handle connection lifecycle
        return new NpgsqlConnection(_connectionString);
    }
}

