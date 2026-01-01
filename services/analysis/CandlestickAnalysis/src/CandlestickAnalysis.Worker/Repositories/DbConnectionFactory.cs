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
        _connectionString = settings.Value.DefaultConnection;
    }

    public IDbConnection CreateConnection()
    {
        return new NpgsqlConnection(_connectionString);
    }
}

