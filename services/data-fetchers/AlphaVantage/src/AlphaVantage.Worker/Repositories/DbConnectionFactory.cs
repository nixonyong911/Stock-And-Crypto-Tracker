using System.Data;
using AlphaVantage.Worker.Configuration;
using Microsoft.Extensions.Options;
using Npgsql;

namespace AlphaVantage.Worker.Repositories;

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

