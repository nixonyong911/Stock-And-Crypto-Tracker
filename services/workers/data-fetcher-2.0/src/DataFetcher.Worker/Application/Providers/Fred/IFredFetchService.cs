namespace DataFetcher.Worker.Application.Providers.Fred;

public interface IFredFetchService
{
    Task<(int SuccessCount, int ErrorCount)> FetchAllIndicatorsAsync(CancellationToken cancellationToken = default);
    Task FetchSingleIndicatorAsync(string seriesId, CancellationToken cancellationToken = default);
}
