namespace DataFetcher.Worker.Application.Scheduling;

/// <summary>
/// Service for synchronizing earnings data by combining Alpha Vantage (upcoming dates)
/// and Finnhub (historical actuals) data sources.
/// </summary>
public interface IEarningsSyncService
{
    /// <summary>
    /// Synchronizes earnings data for all active tickers.
    /// Fetches upcoming earnings from Alpha Vantage and historical actuals from Finnhub.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Total number of earnings records upserted</returns>
    Task<EarningsSyncResult> SyncAllTickersAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Synchronizes earnings data for a specific ticker.
    /// </summary>
    /// <param name="symbol">Stock ticker symbol</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Number of earnings records upserted for this ticker</returns>
    Task<int> SyncTickerAsync(string symbol, CancellationToken cancellationToken = default);
}

/// <summary>
/// Result of an earnings sync operation.
/// </summary>
public class EarningsSyncResult
{
    public int TotalTickers { get; set; }
    public int SuccessCount { get; set; }
    public int ErrorCount { get; set; }
    public int RecordsUpserted { get; set; }
    public TimeSpan Duration { get; set; }
    public List<string> Errors { get; set; } = new();
}
