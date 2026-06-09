using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Infrastructure.Common.Repositories;

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
    /// Gets active stock tickers assigned to a specific data source.
    /// </summary>
    Task<IEnumerable<StockTicker>> GetTickersByDataSourceAsync(int dataSourceId);

    /// <summary>
    /// Gets a stock ticker by ID.
    /// </summary>
    Task<StockTicker?> GetByIdAsync(int id);

    /// <summary>
    /// Gets a stock ticker by symbol.
    /// </summary>
    Task<StockTicker?> GetBySymbolAsync(string symbol);

    /// <summary>
    /// Returns true when the ticker has no stored logo or the stored logo is
    /// older than <paramref name="maxAgeDays"/>. Avoids re-downloading the
    /// logo on every fundamentals run.
    /// </summary>
    Task<bool> NeedsLogoRefreshAsync(int stockTickerId, int maxAgeDays);

    /// <summary>
    /// Stores the company logo bytes and content type for a ticker.
    /// </summary>
    Task UpdateLogoAsync(int stockTickerId, byte[] logoBytes, string contentType);
}
