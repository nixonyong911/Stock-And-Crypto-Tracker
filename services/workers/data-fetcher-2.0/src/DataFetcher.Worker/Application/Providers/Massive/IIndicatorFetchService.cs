using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Application.Providers.Massive;

/// <summary>
/// Service for fetching and processing technical indicators from the Massive API.
/// </summary>
public interface IIndicatorFetchService
{
    /// <summary>
    /// Fetches all 4 indicators (SMA, EMA, MACD, RSI) for a single ticker on a single day,
    /// filters to 15-minute boundaries, merges, and upserts into the database.
    /// </summary>
    /// <param name="ticker">The stock ticker to fetch indicators for.</param>
    /// <param name="targetDate">The trading day to fetch.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The number of indicator records upserted.</returns>
    Task<int> FetchDailyIndicatorsAsync(StockTicker ticker, DateOnly targetDate, CancellationToken cancellationToken = default);

    /// <summary>
    /// Fetches indicators for a ticker across a date range, iterating day by day and skipping weekends.
    /// </summary>
    /// <param name="ticker">The stock ticker to fetch indicators for.</param>
    /// <param name="startDate">The first date in the backfill range (inclusive).</param>
    /// <param name="endDate">The last date in the backfill range (inclusive).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The total number of indicator records upserted across all days.</returns>
    Task<int> FetchBackfillIndicatorsAsync(StockTicker ticker, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default);
}
