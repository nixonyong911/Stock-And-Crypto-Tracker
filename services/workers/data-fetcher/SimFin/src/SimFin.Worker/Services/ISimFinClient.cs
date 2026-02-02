using SimFin.Worker.Models;

namespace SimFin.Worker.Services;

/// <summary>
/// Client for fetching fundamental data from SimFin API.
/// </summary>
public interface ISimFinClient
{
    /// <summary>
    /// Fetches fundamental data for a stock symbol from SimFin.
    /// </summary>
    /// <param name="symbol">Stock ticker symbol (e.g., "AAPL", "NVDA")</param>
    /// <param name="stockTickerId">Database ID for the ticker</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>Fundamentals data or null if not available</returns>
    Task<FundamentalsData?> GetFundamentalsAsync(string symbol, int stockTickerId, CancellationToken ct = default);
}
