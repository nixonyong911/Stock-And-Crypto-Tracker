namespace SimFin.Worker.Configuration;

/// <summary>
/// SimFin API configuration settings.
/// </summary>
public class SimFinSettings
{
    /// <summary>
    /// SimFin API key. Injected via environment variable SIMFIN_API_KEY.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// SimFin API base URL.
    /// </summary>
    public string BaseUrl { get; set; } = "https://backend.simfin.com/api/v3";

    /// <summary>
    /// Delay between API requests in milliseconds to avoid rate limiting.
    /// Default: 500ms
    /// </summary>
    public int DelayBetweenRequestsMs { get; set; } = 500;

    /// <summary>
    /// Maximum number of retry attempts for failed requests.
    /// </summary>
    public int MaxRetries { get; set; } = 3;
}
