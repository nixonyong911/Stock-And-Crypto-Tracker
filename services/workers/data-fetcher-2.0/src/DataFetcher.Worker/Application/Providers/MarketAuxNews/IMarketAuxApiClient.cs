using DataFetcher.Worker.Application.Providers.MarketAuxNews;

namespace DataFetcher.Worker.Application.Providers.MarketAuxNews;

public interface IMarketAuxApiClient
{
    Task<MarketAuxResponse?> FetchNewsAsync(string searchQuery, string? publishedAfter = null, string? entityTypes = null, CancellationToken cancellationToken = default);
}
