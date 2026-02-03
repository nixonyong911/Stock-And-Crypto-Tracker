using DataFetcher.Worker.Domain.Providers.Finnhub.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;

/// <summary>
/// Repository for earnings release schedule operations.
/// </summary>
public interface IEarningsRepository
{
    /// <summary>
    /// Upserts an earnings release schedule entry.
    /// </summary>
    Task UpsertAsync(EarningsReleaseSchedule data);

    /// <summary>
    /// Gets tickers with recent earnings (within specified days).
    /// </summary>
    Task<IEnumerable<int>> GetTickersWithRecentEarningsAsync(int withinDays);

    /// <summary>
    /// Gets upcoming earnings for a ticker.
    /// </summary>
    Task<EarningsReleaseSchedule?> GetUpcomingEarningsAsync(int stockTickerId);

    /// <summary>
    /// Gets earnings by ticker and date.
    /// </summary>
    Task<EarningsReleaseSchedule?> GetByTickerAndDateAsync(int stockTickerId, DateOnly earningsDate);
}
