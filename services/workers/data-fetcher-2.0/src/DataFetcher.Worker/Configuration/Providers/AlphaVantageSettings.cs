namespace DataFetcher.Worker.Configuration.Providers;

/// <summary>
/// Configuration settings for Alpha Vantage API.
/// </summary>
public class AlphaVantageSettings
{
    /// <summary>
    /// Alpha Vantage API key.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Base URL for Alpha Vantage API.
    /// </summary>
    public string BaseUrl { get; set; } = "https://www.alphavantage.co";

    /// <summary>
    /// Delay between API requests in milliseconds (free tier: 5 req/min = 12000ms).
    /// </summary>
    public int RateLimitDelayMs { get; set; } = 12000;

    /// <summary>
    /// Earnings calendar horizon (3month, 6month, or 12month).
    /// </summary>
    public string Horizon { get; set; } = "6month";
}
