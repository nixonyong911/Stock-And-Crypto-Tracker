using System.Data;

namespace CandlestickAnalysis.Worker.Repositories;

/// <summary>
/// Factory for creating database connections.
/// </summary>
public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

