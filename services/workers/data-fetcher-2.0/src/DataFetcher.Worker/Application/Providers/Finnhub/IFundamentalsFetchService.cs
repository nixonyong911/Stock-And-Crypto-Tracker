using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Finnhub.Entities;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

/// <summary>
/// Service for fetching and processing stock fundamentals from Finnhub.
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
