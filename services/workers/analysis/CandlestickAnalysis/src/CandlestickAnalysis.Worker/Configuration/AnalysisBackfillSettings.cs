namespace CandlestickAnalysis.Worker.Configuration;

/// <summary>
/// Configuration settings for historical analysis backfill
/// </summary>
public class AnalysisBackfillSettings
{
    /// <summary>
    /// Number of days of historical data to backfill (default: 180 = 6 months)
    /// </summary>
    public int DaysToBackfill { get; set; } = 180;

    /// <summary>
    /// Number of days to process in each batch (for progress tracking)
    /// </summary>
    public int BatchSizeDays { get; set; } = 30;

    /// <summary>
    /// Delay in milliseconds between processing each date (to prevent CPU overload)
    /// </summary>
    public int DelayBetweenDatesMs { get; set; } = 50;

    /// <summary>
    /// Delay in milliseconds between batches (for logging progress)
    /// </summary>
    public int DelayBetweenBatchesMs { get; set; } = 100;
}
