using DataFetcher.Worker.Domain.Providers.Massive.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public interface IStockIndicatorAdvancedRepository
{
    Task BulkUpsertAsync(IEnumerable<StockIndicatorAdvanced> indicators);
    Task DeleteOldRecordsAsync(int stockTickerId, int retentionDays = 90);
}
