using SimFin.Worker.Models;

namespace SimFin.Worker.Services;

public interface IFundamentalsFetchService
{
    /// <summary>
    /// Fetches and stores fundamentals for all active tickers.
    /// </summary>
    /// <returns>Number of tickers successfully processed</returns>
    Task<int> FetchAllFundamentalsAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Fetches and stores fundamentals for a single ticker.
    /// </summary>
    Task<bool> FetchFundamentalsForTickerAsync(StockTicker ticker, CancellationToken cancellationToken = default);
}
