using Finnhub.Worker.Domain.Models;

namespace Finnhub.Worker.Repositories;

/// <summary>
/// Repository for stock ticker operations.
/// </summary>
public interface IStockTickerRepository
{
    /// <summary>
    /// Gets all active stock tickers.
    /// </summary>
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync();

    /// <summary>
    /// Gets a stock ticker by ID.
    /// </summary>
    Task<StockTicker?> GetByIdAsync(int id);

    /// <summary>
    /// Gets a stock ticker by symbol.
    /// </summary>
    Task<StockTicker?> GetBySymbolAsync(string symbol);
}
