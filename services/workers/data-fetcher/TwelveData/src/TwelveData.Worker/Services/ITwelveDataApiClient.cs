using TwelveData.Worker.Models;

namespace TwelveData.Worker.Services;

public interface ITwelveDataApiClient
{
    Task<TimeSeriesResponse?> GetTimeSeriesAsync(string symbol, FetchConfig config, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Fetches historical time series data with configurable output size and optional date range for batching
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., "AAPL")</param>
    /// <param name="interval">Interval string (e.g., "15min")</param>
    /// <param name="outputSize">Number of data points to fetch (max 5000)</param>
    /// <param name="exchange">Exchange (e.g., "NASDAQ")</param>
    /// <param name="endDate">Optional end date for batching (format: yyyy-MM-ddTHH:mm:ss)</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Time series response with OHLCV data</returns>
    Task<TimeSeriesResponse?> GetHistoricalTimeSeriesAsync(
        string symbol, 
        string interval,
        int outputSize, 
        string exchange = "NASDAQ",
        string? endDate = null,
        CancellationToken cancellationToken = default);
}
