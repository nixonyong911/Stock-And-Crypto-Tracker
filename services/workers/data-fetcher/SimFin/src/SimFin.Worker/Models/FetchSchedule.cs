namespace SimFin.Worker.Models;

/// <summary>
/// Represents a fetch schedule from worker_fetch_schedules table.
/// </summary>
public class FetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public int? WorkerId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TimeSpan ScheduleTime { get; set; }
    public string ScheduleTimezone { get; set; } = "UTC";
    public bool IsEnabled { get; set; }
    public string? FetchConfig { get; set; }
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
    public string? LastRunMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
