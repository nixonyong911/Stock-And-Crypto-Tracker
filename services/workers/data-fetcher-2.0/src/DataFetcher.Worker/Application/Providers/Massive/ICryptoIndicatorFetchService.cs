using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Application.Providers.Massive;

public interface ICryptoIndicatorFetchService
{
    Task<int> FetchDailyIndicatorsAsync(CryptoTicker ticker, DateOnly targetDate, CancellationToken cancellationToken = default);
    Task<int> FetchBackfillIndicatorsAsync(CryptoTicker ticker, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default);
    Task<int> FetchBackfillSingleIndicatorAsync(CryptoTicker ticker, string indicatorType, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken = default);
}
