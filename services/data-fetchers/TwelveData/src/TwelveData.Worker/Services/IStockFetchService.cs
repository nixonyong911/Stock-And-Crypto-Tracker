using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public interface IStockFetchService
{
    Task FetchAndStoreStockDataAsync(FetchSchedule schedule, FetchConfig config, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Fetches data for a specific symbol. Creates the ticker if it doesn't exist.
    /// Uses hardcoded default configuration.
    /// </summary>
    /// <param name="symbol">The stock symbol to fetch (e.g., AAPL)</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Number of records inserted</returns>
    Task<int> FetchSymbolAsync(string symbol, CancellationToken cancellationToken = default);
}
