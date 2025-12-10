namespace AlphaVantage.Worker.Services;

public interface IStockFetchService
{
    Task FetchAndStoreStockDataAsync(CancellationToken cancellationToken = default);
    Task<int> FetchSymbolAsync(string symbol, CancellationToken cancellationToken = default);
}
