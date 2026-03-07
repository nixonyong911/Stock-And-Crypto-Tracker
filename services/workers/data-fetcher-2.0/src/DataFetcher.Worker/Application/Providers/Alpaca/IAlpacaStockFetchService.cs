namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaStockFetchService
{
    Task<int> FetchLatestStockDataAsync(DateTime? since = null, CancellationToken cancellationToken = default);
}
