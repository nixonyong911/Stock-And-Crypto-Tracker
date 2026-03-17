namespace DataFetcher.Worker.Application.Providers.Pipeline;

public class BackfillContext
{
    public int TickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string AssetType { get; set; } = "stock";
    public int DaysToBackfill { get; set; }
    public Dictionary<string, object> StepData { get; set; } = new();
}
