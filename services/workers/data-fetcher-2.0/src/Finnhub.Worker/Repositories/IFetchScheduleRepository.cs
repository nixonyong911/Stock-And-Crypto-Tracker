using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Repositories;

/// <summary>
/// Repository for fetch schedule operations.
/// </summary>
public interface IFetchScheduleRepository
{
    /// <summary>
    /// Gets the schedule for a data source by name.
    /// </summary>
    Task<FetchSchedule?> GetScheduleByDataSourceNameAsync(string dataSourceName);

    /// <summary>
    /// Updates the last run timestamp for a schedule.
    /// </summary>
    Task UpdateLastRunAsync(int scheduleId);
}
