namespace DataFetcher.Worker.Application.Providers.MarketAuxNews;

public interface IMarketAuxNewsFetchService
{
    Task<MarketAuxFetchResult> FetchAndStoreNewsAsync(int cycleBudget = 25, CancellationToken cancellationToken = default);
}

public class MarketAuxFetchResult
{
    public int ArticlesFetched { get; set; }
    public int ArticlesStored { get; set; }
    public int RequestsMade { get; set; }
    public int CleanedUp { get; set; }
    public List<string> Errors { get; set; } = new();
}
