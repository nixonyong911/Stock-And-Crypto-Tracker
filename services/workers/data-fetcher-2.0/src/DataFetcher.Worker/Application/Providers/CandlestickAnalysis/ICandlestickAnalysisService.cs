using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Main service for orchestrating candlestick analysis.
/// </summary>
public interface ICandlestickAnalysisService
{
    /// <summary>
    /// Analyze a single stock for a specific date.
    /// </summary>
    Task<AnalysisResult?> AnalyzeStockAsync(int stockTickerId, string symbol, DateOnly date, CancellationToken cancellationToken = default);

    /// <summary>
    /// Analyze all active stocks for a specific date.
    /// </summary>
    Task<BatchAnalysisResult> AnalyzeAllStocksAsync(DateOnly date, CancellationToken cancellationToken = default);

    /// <summary>
    /// Analyze today's developing (unconfirmed) patterns for all active stocks.
    /// Only runs if market confidence > 0.5.
    /// </summary>
    Task<BatchAnalysisResult> AnalyzeDevelopingStocksAsync(DateOnly today, CancellationToken cancellationToken = default);

    /// <summary>
    /// Analyze weekly candlestick patterns. Intended to run on Friday/Saturday.
    /// </summary>
    Task<BatchAnalysisResult> AnalyzeWeeklyStocksAsync(DateOnly weekEndDate, CancellationToken cancellationToken = default);
}
