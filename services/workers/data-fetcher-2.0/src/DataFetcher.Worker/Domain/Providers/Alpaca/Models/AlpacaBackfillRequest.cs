namespace DataFetcher.Worker.Domain.Providers.Alpaca.Models;

public class AlpacaBackfillRequest
{
    public string Symbol { get; set; } = string.Empty;
    public string? Exchange { get; set; }
    public string AssetType { get; set; } = "stock";
    public int? TickerId { get; set; }
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
}

public class AlpacaBackfillResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int TotalRecordsInserted { get; set; }
    public int PagesProcessed { get; set; }
    public TimeSpan Duration { get; set; }
    public string? Error { get; set; }
}
