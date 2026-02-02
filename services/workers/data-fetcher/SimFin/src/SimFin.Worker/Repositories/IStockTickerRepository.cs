using SimFin.Worker.Models;

namespace SimFin.Worker.Repositories;

public interface IStockTickerRepository
{
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync();
    Task<StockTicker?> GetBySymbolAsync(string symbol);
}
