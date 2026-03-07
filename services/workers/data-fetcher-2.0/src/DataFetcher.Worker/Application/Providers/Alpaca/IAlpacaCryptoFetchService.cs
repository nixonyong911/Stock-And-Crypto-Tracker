namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaCryptoFetchService
{
    Task<int> FetchLatestCryptoDataAsync(DateTime? since = null, CancellationToken cancellationToken = default);
}
