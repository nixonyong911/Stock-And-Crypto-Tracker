namespace DataFetcher.Worker.Application.Providers.GNews;

public interface IGNewsFetchService
{
    Task<GNewsFetchResult> FetchAndStoreHeadlinesAsync(
        List<string> categories,
        int cycleBudget = 10,
        CancellationToken cancellationToken = default);
}

public class GNewsFetchResult
{
    public int ArticlesFetched { get; set; }
    public int ArticlesStored { get; set; }
    public int RequestsMade { get; set; }
    public int CleanedUp { get; set; }
    public List<string> Errors { get; set; } = new();
}
