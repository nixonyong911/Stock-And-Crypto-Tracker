namespace TwelveData.Worker.Configuration;

/// <summary>
/// Configuration for Twelve Data API authentication.
/// Fetch parameters (interval, exchange, etc.) are now stored in the fetch_schedules database table.
/// </summary>
public class TwelveDataSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.twelvedata.com";
}
