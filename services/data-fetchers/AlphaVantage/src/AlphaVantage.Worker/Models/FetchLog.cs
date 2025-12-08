namespace AlphaVantage.Worker.Models;

public class FetchLog
{
    public Guid Id { get; set; }
    public Guid DataSourceId { get; set; }
    public string FetchType { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int RecordsFetched { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

