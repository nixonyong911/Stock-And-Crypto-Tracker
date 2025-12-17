using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public interface IStockTickerRepository
{
    Task<IEnumerable<StockTicker>> GetActiveTickersAsync(string exchange, string currency);
    Task<StockTicker?> GetBySymbolAsync(string symbol);
}

