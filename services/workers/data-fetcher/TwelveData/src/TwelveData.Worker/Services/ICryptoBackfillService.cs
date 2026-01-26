using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

/// <summary>
/// Service for executing crypto historical data backfill operations.
/// Handles 24/7 trading data with different calculation parameters than stocks.
/// </summary>
public interface ICryptoBackfillService
{
    /// <summary>
    /// Executes a historical backfill for a crypto symbol.
    /// Fetches approximately 6 months of 15-minute interval data.
    /// </summary>
    /// <param name="request">The backfill request containing symbol and metadata</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Result containing success status and records inserted</returns>
    Task<CryptoBackfillResult> ExecuteBackfillAsync(
        CryptoBackfillRequest request,
        CancellationToken cancellationToken = default);
}
