namespace DataFetcher.Worker.Application.Providers.MarketAuxNews;

public interface IMarketAuxApiClient
{
    Task<MarketAuxResponse?> FetchNewsAsync(
        string searchQuery,
        string? publishedAfter = null,
        string? entityTypes = null,
        int page = 1,
        CancellationToken cancellationToken = default);
}
