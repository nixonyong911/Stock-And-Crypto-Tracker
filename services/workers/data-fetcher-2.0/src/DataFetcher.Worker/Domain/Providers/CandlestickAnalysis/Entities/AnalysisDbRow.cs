namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Database row model for analysis_stock_candlestick_pattern table.
/// Used for strongly-typed Dapper queries.
/// </summary>
public class AnalysisDbRow
{
    public int StockTickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateTime AnalysisDate { get; set; }
    public decimal? DailyOpen { get; set; }
    public decimal? DailyHigh { get; set; }
    public decimal? DailyLow { get; set; }
    public decimal? DailyClose { get; set; }
    public long? DailyVolume { get; set; }
    public decimal? BodySize { get; set; }
    public decimal? RangeSize { get; set; }
    public decimal? UpperWick { get; set; }
    public decimal? LowerWick { get; set; }
    public bool? IsBullish { get; set; }
    public string? DetectedPatternsJson { get; set; }
    public int CandlesAggregated { get; set; }
    public string AnalysisVersion { get; set; } = "1.0.0";
    public string Timeframe { get; set; } = "daily";
    public bool IsConfirmed { get; set; } = true;
    public decimal Confidence { get; set; } = 1.00m;
}
