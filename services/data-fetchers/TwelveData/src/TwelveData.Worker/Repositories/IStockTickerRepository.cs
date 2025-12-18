using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public interface IStockTickerRepository
{
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync(string exchange, string currency);
    Task<StockTicker?> GetBySymbolAsync(string symbol);
    
    /// <summary>
    /// Gets an existing ticker by symbol, or creates a new one if it doesn't exist.
    /// </summary>
    Task<StockTicker> GetOrCreateTickerAsync(string symbol, string exchange = "NASDAQ", string currency = "USD");
}

