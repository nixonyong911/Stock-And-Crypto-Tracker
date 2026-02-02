namespace Finnhub.Worker.Services;

/// <summary>
/// Service for fetching and processing earnings calendar data.
/// </summary>
public interface IEarningsFetchService
{
    /// <summary>
    /// Syncs the earnings calendar for all tracked tickers.
    /// </summary>
    Task<int> SyncEarningsCalendarAsync(int daysBack = 7, int daysForward = 30, CancellationToken cancellationToken = default);
}
