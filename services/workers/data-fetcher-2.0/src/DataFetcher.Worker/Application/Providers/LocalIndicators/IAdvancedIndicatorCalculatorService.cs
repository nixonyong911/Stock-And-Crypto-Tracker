namespace DataFetcher.Worker.Application.Providers.LocalIndicators;

public interface IAdvancedIndicatorCalculatorService
{
    Task<BatchIndicatorResult> ComputeAllStockAdvancedIndicatorsAsync(CancellationToken cancellationToken = default);
    Task<BatchIndicatorResult> ComputeAllCryptoAdvancedIndicatorsAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Backfill advanced indicators for a single stock ticker using all available
    /// historical candlestick data. Called during the new-ticker backfill pipeline.
    /// </summary>
    Task<BackfillAdvancedResult> BackfillStockAdvancedIndicatorsAsync(int stockTickerId, string symbol, CancellationToken cancellationToken = default);

    /// <summary>
    /// Backfill advanced indicators for a single crypto ticker using all available
    /// historical candlestick data. Called during the new-ticker backfill pipeline.
    /// </summary>
    Task<BackfillAdvancedResult> BackfillCryptoAdvancedIndicatorsAsync(int cryptoTickerId, string symbol, CancellationToken cancellationToken = default);
}

public class BackfillAdvancedResult
{
    public int DaysComputed { get; set; }
    public int DaysSkipped { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
}
