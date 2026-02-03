using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

/// <summary>
/// Repository for earnings release schedule operations.
/// Shared across providers (Alpha Vantage, etc.).
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
