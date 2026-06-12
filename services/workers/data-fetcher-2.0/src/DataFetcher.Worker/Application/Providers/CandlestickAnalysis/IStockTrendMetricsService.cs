namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Computes and stores the 52-week range and long moving averages
/// (SMA-50 / SMA-200 / EMA-50) for stock-universe tickers from eToro OneDay
/// candles. Covers indexes and ETFs that have no Finnhub fundamentals row.
/// </summary>
public interface IStockTrendMetricsService
{
    /// <summary>
    /// Refreshes trend metrics for all active stock tickers (with an eToro
    /// instrument id) not already computed today. Returns the number of
    /// tickers upserted.
    /// </summary>
    Task<int> RefreshAllAsync(CancellationToken cancellationToken = default);
}
