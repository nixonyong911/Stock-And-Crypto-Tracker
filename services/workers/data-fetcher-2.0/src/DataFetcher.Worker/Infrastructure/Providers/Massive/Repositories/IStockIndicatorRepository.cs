using DataFetcher.Worker.Domain.Providers.Massive.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

/// <summary>
/// Repository for stock technical indicator operations.
/// </summary>
public interface IStockIndicatorRepository
{
    /// <summary>
    /// Bulk upserts technical indicator data, preserving existing non-null column values
    /// when the incoming value is null (per-column COALESCE).
    /// </summary>
    /// <param name="indicators">The indicator records to upsert.</param>
    Task BulkUpsertAsync(IEnumerable<StockIndicator> indicators);

    /// <summary>
    /// Deletes indicator records older than the specified retention period.
    /// </summary>
    /// <param name="stockTickerId">The stock ticker identifier.</param>
    /// <param name="retentionDays">Number of days to retain. Defaults to 90.</param>
    Task DeleteOldRecordsAsync(int stockTickerId, int retentionDays = 90);

    /// <summary>
    /// Retrieves all indicator records for a ticker on a specific date, ordered by time.
    /// </summary>
    /// <param name="stockTickerId">The stock ticker identifier.</param>
    /// <param name="date">The date to query.</param>
    /// <returns>Indicator records matching the ticker and date.</returns>
    Task<IEnumerable<StockIndicator>> GetByTickerAndDateAsync(int stockTickerId, DateTime date);
}
