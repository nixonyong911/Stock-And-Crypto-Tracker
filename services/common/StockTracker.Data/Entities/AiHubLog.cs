namespace StockTracker.Data.Entities;

/// <summary>
/// AI Hub request/response log entry.
/// Stores all API calls through the AI Hub service.
/// Retention: 7 days (cleaned up by AI Hub service).
/// </summary>
public class AiHubLog
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// Unique identifier for this request (for correlation).
    /// </summary>
    public Guid RequestId { get; set; }
    
    /// <summary>
    /// Full model identifier (e.g., api-stockandcryptotracker-google-gemini-3-flash).
    /// </summary>
    public string ModelId { get; set; } = string.Empty;
    
    /// <summary>
    /// Name of the service that made the request (e.g., twelvedata-worker).
    /// </summary>
    public string? CallerService { get; set; }
    
    /// <summary>
    /// Google Cloud project ID (for rate limit correlation).
    /// </summary>
    public string? GoogleProjectId { get; set; }
    
    /// <summary>
    /// Preview of the input message (truncated to 500 chars).
    /// </summary>
    public string? MessagePreview { get; set; }
    
    /// <summary>
    /// Preview of the AI response (truncated to 500 chars).
    /// </summary>
    public string? ResponsePreview { get; set; }
    
    /// <summary>
    /// Number of input tokens used.
    /// </summary>
    public int? TokensInput { get; set; }
    
    /// <summary>
    /// Number of output tokens used.
    /// </summary>
    public int? TokensOutput { get; set; }
    
    /// <summary>
    /// Request duration in milliseconds.
    /// </summary>
    public int? DurationMs { get; set; }
    
    /// <summary>
    /// Number of retry attempts made.
    /// </summary>
    public int RetryCount { get; set; }
    
    /// <summary>
    /// Type of rate limit hit (RPM, TPM, RPD), null if no limit hit.
    /// </summary>
    public string? RateLimitType { get; set; }
    
    /// <summary>
    /// Request status: success, rate_limited, server_error, unavailable, client_error, timeout.
    /// </summary>
    public string Status { get; set; } = string.Empty;
    
    /// <summary>
    /// HTTP status code from the AI provider (200, 429, 500, etc.).
    /// </summary>
    public int? HttpStatusCode { get; set; }
    
    /// <summary>
    /// Error message if the request failed.
    /// </summary>
    public string? ErrorMessage { get; set; }
    
    /// <summary>
    /// When the request was made.
    /// </summary>
    public DateTime CreatedAt { get; set; }
}

