using TwelveData.Worker.Models;

namespace TwelveData.Worker.Repositories;

public interface IStockPriceRepository
{
    Task<DataSource?> GetDataSourceByNameAsync(string name);
    Task UpsertStockPriceAsync(StockPrice price);
    Task UpsertStockPricesBatchAsync(IEnumerable<StockPrice> prices);
}

