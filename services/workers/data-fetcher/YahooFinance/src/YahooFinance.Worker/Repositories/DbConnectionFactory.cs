using System.Data;
using Microsoft.Extensions.Options;
using Npgsql;
using YahooFinance.Worker.Configuration;

namespace YahooFinance.Worker.Repositories;

public class DbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IOptions<DatabaseSettings> settings)
    {
        var baseConnectionString = settings.Value.DefaultConnection;

        // Configure connection for direct Supabase connection
        var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
        {
            CommandTimeout = 120,
            Timeout = 30,
            SslMode = SslMode.Require,
            Pooling = true,
            MaxPoolSize = 10
        };

        _connectionString = builder.ConnectionString;
    }

    public IDbConnection CreateConnection()
    {
        return new NpgsqlConnection(_connectionString);
    }
}
