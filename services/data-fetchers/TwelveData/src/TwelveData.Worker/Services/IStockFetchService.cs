namespace TwelveData.Worker.Services;

public interface IStockFetchService
{
    Task FetchAndStoreStockDataAsync(CancellationToken cancellationToken = default);
}

