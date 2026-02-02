using YahooFinance.Worker.Models;

namespace YahooFinance.Worker.Services;

public interface IYahooFinanceClient
{
    /// <summary>
    /// Fetches fundamental data for a stock symbol from Yahoo Finance.
    /// </summary>
    /// <param name="symbol">Stock ticker symbol (e.g., "AAPL", "NVDA")</param>
    /// <returns>Fundamentals data or null if not available</returns>
    Task<FundamentalsData?> GetFundamentalsAsync(string symbol, int stockTickerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Fetches upcoming earnings dates for a stock symbol.
    /// </summary>
    /// <param name="symbol">Stock ticker symbol</param>
    /// <param name="stockTickerId">Database ID for the ticker</param>
    /// <returns>List of earnings data</returns>
    Task<IEnumerable<EarningsData>> GetEarningsCalendarAsync(string symbol, int stockTickerId, CancellationToken cancellationToken = default);
}
