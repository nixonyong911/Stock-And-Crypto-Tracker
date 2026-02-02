namespace YahooFinance.Worker.Configuration;

/// <summary>
/// Yahoo Finance API configuration settings.
/// </summary>
public class YahooFinanceSettings
{
    /// <summary>
    /// Delay between API requests in milliseconds to avoid rate limiting.
    /// Default: 500ms
    /// </summary>
    public int DelayBetweenRequestsMs { get; set; } = 500;

    /// <summary>
    /// Maximum number of retry attempts for failed requests.
    /// </summary>
    public int MaxRetries { get; set; } = 5;

    /// <summary>
    /// Number of consecutive failures before circuit breaker trips.
    /// </summary>
    public int CircuitBreakerThreshold { get; set; } = 10;

    /// <summary>
    /// Duration in seconds to keep circuit breaker open after tripping.
    /// </summary>
    public int CircuitBreakerDurationSeconds { get; set; } = 60;
}
