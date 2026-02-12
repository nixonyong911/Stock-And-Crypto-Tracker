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
}
