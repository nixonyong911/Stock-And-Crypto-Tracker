using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public interface IStockTickerRepository
{
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync(string exchange, string currency);
    
    /// <summary>
    /// Gets all active tickers regardless of exchange.
    /// </summary>
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync();
    
    /// <summary>
    /// Gets all tickers (active and inactive)
    /// </summary>
    Task<IEnumerable<StockTicker>> GetAllTickersAsync();
    
    Task<StockTicker?> GetBySymbolAsync(string symbol);
    
    Task<StockTicker?> GetByIdAsync(int id);
    
    /// <summary>
    /// Gets an existing ticker by symbol, or creates a new one if it doesn't exist.
    /// </summary>
    Task<StockTicker> GetOrCreateTickerAsync(string symbol, string exchange = "NASDAQ", string currency = "USD");
    
    /// <summary>
    /// Creates a new ticker with full details from verification
    /// </summary>
    Task<StockTicker> CreateTickerAsync(string symbol, string? name, string? exchange, string currency);
    
    /// <summary>
    /// Updates the active status of a ticker
    /// </summary>
    Task<StockTicker?> UpdateActiveStatusAsync(int id, bool isActive);
}

