using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public interface IStockFetchService
{
    Task FetchAndStoreStockDataAsync(FetchSchedule schedule, FetchConfig config, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Fetches data for a specific symbol. Creates the ticker if it doesn't exist.
    /// </summary>
    /// <param name="symbol">The stock symbol to fetch (e.g., AAPL)</param>
    /// <param name="date">Optional date to fetch (e.g., "2025-12-24", "yesterday"). Defaults to "yesterday" if null.</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Number of records inserted</returns>
    Task<int> FetchSymbolAsync(string symbol, string? date = null, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Fetches data for all active tickers in the database.
    /// </summary>
    /// <param name="date">Optional date to fetch. Defaults to "yesterday" if null.</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Batch fetch result with success/failure counts</returns>
    Task<BatchFetchResult> FetchAllActiveTickersAsync(string? date = null, CancellationToken cancellationToken = default);
}

public class BatchFetchResult
{
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int TotalRecordsInserted { get; set; }
    public List<SymbolResult> SymbolResults { get; set; } = new();
}

public class SymbolResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int RecordsInserted { get; set; }
    public string? Error { get; set; }
}
