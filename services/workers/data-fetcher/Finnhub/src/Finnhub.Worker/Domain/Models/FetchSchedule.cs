namespace Finnhub.Worker.Domain.Models;

/// <summary>
/// Worker fetch schedule from worker_fetch_schedules table.
/// </summary>
public class FetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public TimeOnly ScheduleTimeUtc { get; set; }
    public bool IsEnabled { get; set; }
    public DateTime? LastRunAt { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
