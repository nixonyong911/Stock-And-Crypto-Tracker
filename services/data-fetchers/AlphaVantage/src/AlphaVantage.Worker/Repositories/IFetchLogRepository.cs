using AlphaVantage.Worker.Models;

namespace AlphaVantage.Worker.Repositories;

public interface IFetchLogRepository
{
    Task<Guid> StartFetchLogAsync(Guid dataSourceId, string fetchType);
    Task CompleteFetchLogAsync(Guid logId, int recordsFetched);
    Task FailFetchLogAsync(Guid logId, string errorMessage);
}

