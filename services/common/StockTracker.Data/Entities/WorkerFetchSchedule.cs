namespace StockTracker.Data.Entities;

/// <summary>
/// Worker scheduling configuration stored in worker_fetch_schedules table.
/// Stores when and how workers should run their scheduled tasks.
/// Links to worker_registry via WorkerId for proper relational lookup.
/// </summary>
public class WorkerFetchSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    
    /// <summary>
    /// Foreign key to worker_registry table for proper schedule-worker linking.
    /// Nullable for backward compatibility during migration.
    /// </summary>
    public int? WorkerId { get; set; }
    
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

























