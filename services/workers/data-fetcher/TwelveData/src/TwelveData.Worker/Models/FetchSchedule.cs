namespace TwelveData.Worker.Models;

/// <summary>
/// Represents a schedule record from the worker_fetch_schedules table.
/// Links to worker_registry via WorkerId for proper schedule-worker association.
/// </summary>
public class FetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    /// <summary>
    /// Foreign key to worker_registry table for proper schedule-worker linking.
    /// </summary>
    public int? WorkerId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>
    /// Time of day to run (in ScheduleTimezone)
    /// </summary>
    public TimeSpan ScheduleTime { get; set; }
    /// <summary>
    /// IANA timezone for ScheduleTime (e.g., "America/New_York")
    /// </summary>
    public string ScheduleTimezone { get; set; } = "America/New_York";
    public bool IsEnabled { get; set; }
    public string FetchConfig { get; set; } = "{}";
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
    public string? LastRunMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}












