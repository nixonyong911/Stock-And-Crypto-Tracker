namespace DataFetcher.Worker.Application.Providers.AlphaVantage;

/// <summary>
/// Service interface for fetching and processing earnings calendar data from Alpha Vantage.
/// </summary>
public interface IEarningsCalendarService
{
    /// <summary>
    /// Syncs earnings calendar for all active tickers.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Number of earnings events synced.</returns>
    Task<int> SyncAllEarningsCalendarAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Syncs earnings calendar for a specific symbol.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., "NVDA").</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Number of earnings events synced.</returns>
    Task<int> SyncEarningsCalendarBySymbolAsync(string symbol, CancellationToken cancellationToken = default);
}
