using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public interface IFetchScheduleRepository
{
    Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName);
    Task<FetchSchedule?> GetScheduleByNameAsync(string scheduleName);
    Task UpdateLastRunAsync(int scheduleId, string status, string? message);
}




