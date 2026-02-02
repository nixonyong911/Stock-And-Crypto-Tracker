using System.Data;

namespace YahooFinance.Worker.Repositories;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}
