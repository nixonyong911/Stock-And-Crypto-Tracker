namespace StockTracker.Data.Entities;

/// <summary>
/// Worker scheduling configuration for data fetching.
/// Stores when and how workers should fetch data from data sources.
/// </summary>
public class FetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    // Scheduling
    public TimeOnly ScheduleTimeUtc { get; set; } = new TimeOnly(22, 0); // Default 10 PM UTC
    public bool IsEnabled { get; set; } = true;
    
    // Fetch parameters (JSONB - flexible configuration)
    public string FetchConfig { get; set; } = "{}";
    
    // Run tracking
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; } // success, failed, partial
    public string? LastRunMessage { get; set; }
    
    // Standard fields
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation property
    public DataSource DataSource { get; set; } = null!;
}









