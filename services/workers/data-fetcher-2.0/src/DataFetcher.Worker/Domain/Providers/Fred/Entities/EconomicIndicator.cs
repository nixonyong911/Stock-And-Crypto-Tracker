namespace DataFetcher.Worker.Domain.Providers.Fred.Entities;

public class EconomicIndicator
{
    public int Id { get; set; }
    public string SeriesId { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string BullishWhen { get; set; } = string.Empty;
    public string DisplayMode { get; set; } = "rate";
    public double DisplayDivisor { get; set; } = 1;
}
