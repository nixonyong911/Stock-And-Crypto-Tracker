using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public interface ITwelveDataApiClient
{
    Task<TimeSeriesResponse?> GetTimeSeriesAsync(string symbol, FetchConfig config, CancellationToken cancellationToken = default);
}
