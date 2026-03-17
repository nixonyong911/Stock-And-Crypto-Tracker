using DataFetcher.Worker.Domain.Providers.Massive.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public interface ICryptoIndicatorAdvancedRepository
{
    Task BulkUpsertAsync(IEnumerable<CryptoIndicatorAdvanced> indicators);
    Task DeleteOldRecordsAsync(int cryptoTickerId, int retentionDays = 90);
}
