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
    /// Updates the last run details for a schedule.
    /// </summary>
    Task UpdateLastRunAsync(int scheduleId, string status, string? message);
}
