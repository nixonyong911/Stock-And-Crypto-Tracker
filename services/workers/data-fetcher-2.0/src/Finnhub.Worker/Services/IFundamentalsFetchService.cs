using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Services;

/// <summary>
/// Service for fetching and processing stock fundamentals.
/// </summary>
public interface IFundamentalsFetchService
{
    /// <summary>
    /// Fetches and stores fundamentals for a single ticker.
    /// </summary>
    Task<FundamentalsData?> FetchAndStoreFundamentalsAsync(StockTicker ticker, CancellationToken cancellationToken = default);

    /// <summary>
    /// Fetches and stores fundamentals for all active tickers.
    /// </summary>
    Task<int> FetchAndStoreAllFundamentalsAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Fetches and stores fundamentals for tickers with recent earnings.
    /// </summary>
    Task<int> FetchFundamentalsForRecentEarningsAsync(int withinDays = 2, CancellationToken cancellationToken = default);
}
