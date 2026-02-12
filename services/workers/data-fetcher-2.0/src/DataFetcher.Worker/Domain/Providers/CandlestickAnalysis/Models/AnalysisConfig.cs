namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;

/// <summary>
/// Analysis configuration parsed from worker_fetch_schedules.fetch_config JSONB.
/// </summary>
public class AnalysisConfig
{
    public string AnalyzeDate { get; set; } = "yesterday";
}
