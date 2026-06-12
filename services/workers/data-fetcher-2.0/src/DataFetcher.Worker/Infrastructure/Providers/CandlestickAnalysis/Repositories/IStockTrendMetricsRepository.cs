using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

/// <summary>
/// Repository for the stock trend metrics table (analysis_stock_trend_metrics).
/// </summary>
public interface IStockTrendMetricsRepository
{
    /// <summary>
    /// Upserts the trend metrics for a stock ticker (one row per ticker).
    /// </summary>
    Task UpsertAsync(StockTrendMetrics metrics);

    /// <summary>
    /// Returns ticker ids whose metrics were already computed on or after the
    /// given UTC timestamp. Used to make the daily compute step idempotent
    /// when the pipeline fires more than once per day.
    /// </summary>
    Task<IReadOnlySet<int>> GetComputedSinceAsync(DateTime sinceUtc);

    /// <summary>
    /// Latest metrics row for a ticker, or null when absent or older than
    /// <paramref name="maxAgeDays"/>. Used by the price-target path to feed
    /// the long-horizon trend snapshot.
    /// </summary>
    Task<StockTrendMetrics?> GetLatestAsync(int stockTickerId, int maxAgeDays);
}
