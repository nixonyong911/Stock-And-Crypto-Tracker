using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public interface IFetchScheduleRepository
{
    Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName);
    Task UpdateLastRunAsync(int scheduleId, string status, string? message);
}

