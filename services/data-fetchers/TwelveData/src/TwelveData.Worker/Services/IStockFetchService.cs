using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public interface IStockFetchService
{
    Task FetchAndStoreStockDataAsync(FetchSchedule schedule, FetchConfig config, CancellationToken cancellationToken = default);
}
