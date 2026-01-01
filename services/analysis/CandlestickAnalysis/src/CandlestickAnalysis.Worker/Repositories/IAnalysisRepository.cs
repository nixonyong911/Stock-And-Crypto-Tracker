using CandlestickAnalysis.Worker.Models;

namespace CandlestickAnalysis.Worker.Repositories;

/// <summary>
/// Repository for writing analysis results.
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
}

