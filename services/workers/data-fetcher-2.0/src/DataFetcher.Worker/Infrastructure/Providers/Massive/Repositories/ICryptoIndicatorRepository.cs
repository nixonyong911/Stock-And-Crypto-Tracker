using DataFetcher.Worker.Domain.Providers.Massive.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;

public interface ICryptoIndicatorRepository
{
    Task BulkUpsertAsync(IEnumerable<CryptoIndicator> indicators);
    Task DeleteOldRecordsAsync(int cryptoTickerId, int retentionDays = 90);
    Task<IEnumerable<CryptoIndicator>> GetByTickerAndDateAsync(int cryptoTickerId, DateTime date);
}
