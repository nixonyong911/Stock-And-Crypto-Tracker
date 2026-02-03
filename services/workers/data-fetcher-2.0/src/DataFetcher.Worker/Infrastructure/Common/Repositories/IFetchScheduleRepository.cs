using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

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
    /// Gets the schedule by its name (for orchestrated schedules without a single data source).
    /// </summary>
    Task<FetchSchedule?> GetScheduleByNameAsync(string scheduleName);

    /// <summary>
    /// Updates the last run details for a schedule.
    /// </summary>
    Task UpdateLastRunAsync(int scheduleId, string status, string? message);
}
