using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

/// <summary>
/// Repository for writing and reading candlestick analysis results.
/// </summary>
public interface IAnalysisRepository
{
    /// <summary>
    /// Insert or update an analysis result.
    /// </summary>
    Task UpsertAnalysisAsync(AnalysisResult result);

    /// <summary>
    /// Get analysis results for a symbol and date range.
    /// </summary>
    Task<IEnumerable<AnalysisResult>> GetAnalysisAsync(string symbol, DateOnly? startDate, DateOnly? endDate);

    /// <summary>
    /// Check if analysis exists for a stock on a date.
    /// </summary>
    Task<bool> ExistsAsync(int stockTickerId, DateOnly date);

    /// <summary>
    /// Get dates that have already been analyzed for a ticker within a date range.
    /// Used for backfill to skip dates that are already done.
    /// </summary>
    Task<IEnumerable<DateOnly>> GetAnalyzedDatesAsync(int stockTickerId, DateOnly startDate, DateOnly endDate);
}
