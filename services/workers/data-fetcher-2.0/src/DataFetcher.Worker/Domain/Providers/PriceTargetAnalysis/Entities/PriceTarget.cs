namespace DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

public class PriceTarget
{
    public int StockTickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string AssetType { get; set; } = "stock";
    public DateOnly AnalysisDate { get; set; }
    public decimal LatestClose { get; set; }
    public decimal? EntryPrice { get; set; }
    public decimal? TargetPrice { get; set; }
    public decimal? StopLoss { get; set; }
    public string SignalSummary { get; set; } = "neutral";
    public string CalculationMethod { get; set; } = "technical_composite";
    public decimal? Confidence { get; set; }
    public string MetadataJson { get; set; } = "{}";
}

public class BackfillResult
{
    public int TotalDates { get; set; }
    public int Computed { get; set; }
    public int Skipped { get; set; }
    public int Failed { get; set; }
    public TimeSpan Duration { get; set; }
    public List<string> Errors { get; set; } = new();
}

public class BatchPriceTargetResult
{
    public bool Success { get; set; }
    public int TotalStocks { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int SkippedCount { get; set; }
    public DateOnly AnalysisDate { get; set; }
    public double DurationSeconds { get; set; }
    public List<string> Errors { get; set; } = new();
}
