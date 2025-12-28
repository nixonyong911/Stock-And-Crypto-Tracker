namespace TwelveData.Worker.Models;

/// <summary>
/// Represents a fetch schedule record from the fetch_schedules table
/// </summary>
public class FetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TimeOnly ScheduleTimeUtc { get; set; }
    public bool IsEnabled { get; set; }
    public string FetchConfig { get; set; } = "{}";
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
    public string? LastRunMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}











