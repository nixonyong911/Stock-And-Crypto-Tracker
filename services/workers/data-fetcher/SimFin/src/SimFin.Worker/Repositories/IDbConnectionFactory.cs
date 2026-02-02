using System.Data;

namespace SimFin.Worker.Repositories;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}
