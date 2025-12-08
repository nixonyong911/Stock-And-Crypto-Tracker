using AlphaVantage.Worker.Models;

namespace AlphaVantage.Worker.Repositories;

public interface IStockRepository
{
    Task<Stock?> GetBySymbolAsync(string symbol);
    Task<Stock> CreateStockAsync(string symbol, string? name = null);
    Task<DataSource?> GetDataSourceByNameAsync(string name);
    Task<bool> StockPriceExistsAsync(Guid stockId, Guid dataSourceId, DateTime priceDate);
    Task InsertStockPriceAsync(StockDailyPrice price);
    Task UpsertStockPriceAsync(StockDailyPrice price);
    Task<IEnumerable<Stock>> GetActiveStocksAsync();
}

