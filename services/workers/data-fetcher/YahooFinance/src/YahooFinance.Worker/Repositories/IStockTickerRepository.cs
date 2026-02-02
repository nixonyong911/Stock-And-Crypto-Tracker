using YahooFinance.Worker.Models;

namespace YahooFinance.Worker.Repositories;

public interface IStockTickerRepository
{
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync();
    Task<StockTicker?> GetBySymbolAsync(string symbol);
}
