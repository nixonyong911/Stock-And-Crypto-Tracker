using DataFetcher.Worker.Infrastructure.Providers.AlphaVantage.Models;

namespace DataFetcher.Worker.Infrastructure.Providers.AlphaVantage;

/// <summary>
/// Client interface for Alpha Vantage API.
/// </summary>
public interface IAlphaVantageApiClient
{
    /// <summary>
    /// Gets earnings calendar for a specific symbol.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., "NVDA").</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of earnings calendar items for the symbol.</returns>
    Task<IEnumerable<EarningsCalendarItem>> GetEarningsCalendarAsync(
        string symbol, 
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets earnings calendar for all companies (no symbol filter).
    /// Note: This returns a large dataset, use sparingly.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of all earnings calendar items.</returns>
    Task<IEnumerable<EarningsCalendarItem>> GetAllEarningsCalendarAsync(
        CancellationToken cancellationToken = default);
}
