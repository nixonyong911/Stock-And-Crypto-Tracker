using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

/// <summary>
/// Service for executing historical data backfill operations
/// </summary>
public interface IHistoricalBackfillService
{
    /// <summary>
    /// Executes a historical backfill for the specified symbol
    /// Fetches 6 months of historical data using the configured interval
    /// </summary>
    /// <param name="request">Backfill request containing symbol and exchange</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Result of the backfill operation</returns>
    Task<BackfillResult> ExecuteBackfillAsync(BackfillRequest request, CancellationToken cancellationToken = default);
}
