using StockTracker.Data.Entities;

namespace TwelveData.Worker.Repositories;

public interface ICryptoPriceRepository
{
    /// <summary>
    /// Batch upsert crypto prices using multi-value INSERT with ON CONFLICT
    /// </summary>
    Task UpsertCryptoPricesBatchAsync(List<CryptoPrice> prices);
    
    /// <summary>
    /// Get data source by name (e.g., "TwelveData")
    /// </summary>
    Task<Models.DataSource?> GetDataSourceByNameAsync(string name);
}
