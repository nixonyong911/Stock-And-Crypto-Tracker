using DataFetcher.Worker.Infrastructure.Providers.Finnhub;

namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;

public interface IInsiderTradingRepository
{
    Task<int> BulkUpsertAsync(int stockTickerId, string symbol, List<InsiderTransaction> transactions);
    Task<int> CleanupOldTransactionsAsync(int retentionDays = 90);
}
