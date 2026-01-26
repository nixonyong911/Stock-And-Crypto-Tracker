using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public interface ICryptoFetchService
{
    /// <summary>
    /// Fetches and stores crypto data for all active tickers based on the schedule configuration.
    /// </summary>
    Task FetchAndStoreCryptoDataAsync(FetchSchedule schedule, CryptoFetchConfig config, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Fetches data for a specific crypto symbol. Creates the ticker if it doesn't exist.
    /// </summary>
    /// <param name="symbol">The crypto symbol to fetch (e.g., BTC/USD)</param>
    /// <param name="date">Optional date to fetch (e.g., "2025-12-24", "yesterday"). Defaults to "yesterday" if null.</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Number of records inserted</returns>
    Task<int> FetchSymbolAsync(string symbol, string? date = null, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Fetches data for all active crypto tickers in the database.
    /// </summary>
    /// <param name="date">Optional date to fetch. Defaults to "yesterday" if null.</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Batch fetch result with success/failure counts</returns>
    Task<CryptoBatchFetchResult> FetchAllActiveTickersAsync(string? date = null, CancellationToken cancellationToken = default);
}

public class CryptoBatchFetchResult
{
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int TotalRecordsInserted { get; set; }
    public List<CryptoSymbolResult> SymbolResults { get; set; } = new();
}

public class CryptoSymbolResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int RecordsInserted { get; set; }
    public string? Error { get; set; }
}
