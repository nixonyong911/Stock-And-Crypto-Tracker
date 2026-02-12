using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Service for executing historical candlestick analysis backfill operations.
/// </summary>
public interface IAnalysisBackfillService
{
    /// <summary>
    /// Executes a historical analysis backfill for the specified symbol.
    /// Analyzes all dates with price data that haven't been analyzed yet.
    /// </summary>
    Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default);
}
