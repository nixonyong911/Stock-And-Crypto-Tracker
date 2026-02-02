namespace Finnhub.Worker.Configuration;

/// <summary>
/// Finnhub API configuration settings.
/// </summary>
public class FinnhubSettings
{
    /// <summary>
    /// Finnhub API key.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Finnhub API base URL.
    /// </summary>
    public string BaseUrl { get; set; } = "https://finnhub.io/api/v1";

    /// <summary>
    /// Delay between API calls in milliseconds to respect rate limits.
    /// </summary>
    public int RateLimitDelayMs { get; set; } = 2000;
}
