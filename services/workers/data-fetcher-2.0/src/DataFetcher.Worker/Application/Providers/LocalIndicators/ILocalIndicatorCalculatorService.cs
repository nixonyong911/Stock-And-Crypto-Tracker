namespace DataFetcher.Worker.Application.Providers.LocalIndicators;

/// <summary>
/// Computes technical indicators (SMA, EMA, MACD, RSI) locally from daily close data
/// stored in candlestick analysis tables, eliminating the need for external API calls.
/// </summary>
public interface ILocalIndicatorCalculatorService
{
    Task<BatchIndicatorResult> ComputeAllStockIndicatorsAsync(CancellationToken cancellationToken = default);
    Task<BatchIndicatorResult> ComputeAllCryptoIndicatorsAsync(CancellationToken cancellationToken = default);
}

public class BatchIndicatorResult
{
    public int TotalTickers { get; set; }
    public int SuccessCount { get; set; }
    public int SkippedCount { get; set; }
    public int FailedCount { get; set; }
    public double DurationSeconds { get; set; }
    public List<string> Errors { get; set; } = new();
    public bool Success => FailedCount == 0;
}
