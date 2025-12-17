using System.Data;

namespace TwelveData.Worker.Repositories;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}

