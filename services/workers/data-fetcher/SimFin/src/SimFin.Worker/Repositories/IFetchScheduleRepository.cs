using SimFin.Worker.Models;

namespace SimFin.Worker.Repositories;

public interface IFetchScheduleRepository
{
    Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName);
    Task UpdateLastRunAsync(int scheduleId, string status, string? message);
}
