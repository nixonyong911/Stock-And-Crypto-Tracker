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
}
