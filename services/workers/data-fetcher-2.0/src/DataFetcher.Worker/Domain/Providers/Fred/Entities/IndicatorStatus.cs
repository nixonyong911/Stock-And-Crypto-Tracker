namespace DataFetcher.Worker.Domain.Providers.Fred.Entities;

public class IndicatorStatus
{
    public string SeriesId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public double? CurrentValue { get; set; }
    public DateTime? CurrentDate { get; set; }
    public double? PreviousValue { get; set; }
    public DateTime? PreviousDate { get; set; }
    public double? ChangePercent { get; set; }
    public string? Trend { get; set; }
    public string? CurrentSignal { get; set; }
    public DateTime? LastUpdatedAt { get; set; }
    public string DisplayMode { get; set; } = "rate";
    public double DisplayDivisor { get; set; } = 1;
    public double? MediaCurrentValue { get; set; }
    public double? MediaPreviousValue { get; set; }
    public DateTime? LastReleaseDate { get; set; }
}
