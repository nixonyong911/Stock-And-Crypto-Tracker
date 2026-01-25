using CandlestickAnalysis.Worker.Models;

namespace CandlestickAnalysis.Worker.Services;

/// <summary>
/// Service for executing historical candlestick analysis backfill operations
/// </summary>
public interface IAnalysisBackfillService
{
    /// <summary>
    /// Executes a historical analysis backfill for the specified symbol.
    /// Analyzes all dates with price data that haven't been analyzed yet.
    /// </summary>
    /// <param name="request">Backfill request containing symbol</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Result of the backfill operation</returns>
    Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default);
}
