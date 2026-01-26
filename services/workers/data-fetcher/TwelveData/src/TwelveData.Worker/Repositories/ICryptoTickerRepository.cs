using StockTracker.Data.Entities;

namespace TwelveData.Worker.Repositories;

public interface ICryptoTickerRepository
{
    Task<IEnumerable<CryptoTicker>> GetActiveTickersAsync();
    Task<IEnumerable<CryptoTicker>> GetAllTickersAsync();
    Task<CryptoTicker?> GetBySymbolAsync(string symbol);
    Task<CryptoTicker?> GetByIdAsync(int id);
    Task<CryptoTicker> CreateTickerAsync(string symbol, string? name);
    Task<CryptoTicker?> UpdateActiveStatusAsync(int id, bool isActive);
    Task<CryptoTicker> GetOrCreateTickerAsync(string symbol, string? name = null);
}
