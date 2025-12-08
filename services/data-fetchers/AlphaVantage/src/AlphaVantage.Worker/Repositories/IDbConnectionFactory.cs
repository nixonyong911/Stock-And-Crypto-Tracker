using System.Data;

namespace AlphaVantage.Worker.Repositories;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

