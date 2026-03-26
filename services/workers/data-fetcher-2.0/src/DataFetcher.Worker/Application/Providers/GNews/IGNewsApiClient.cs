namespace DataFetcher.Worker.Application.Providers.GNews;

public interface IGNewsApiClient
{
    Task<GNewsResponse?> FetchTopHeadlinesAsync(
        string category,
        int max = 10,
        CancellationToken cancellationToken = default);
}
