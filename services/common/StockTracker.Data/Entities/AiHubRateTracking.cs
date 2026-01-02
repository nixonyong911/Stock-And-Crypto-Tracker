namespace StockTracker.Data.Entities;

/// <summary>
/// AI Hub rate limit tracking.
/// Tracks RPM/TPM/RPD usage per Google Cloud project and model family.
/// Per Google Gemini docs, rate limits are per PROJECT, not per API key.
/// </summary>
public class AiHubRateTracking
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// Google Cloud project ID.
    /// </summary>
    public string GoogleProjectId { get; set; } = string.Empty;
    
    /// <summary>
    /// Model family (e.g., gemini-3-flash, gemini-2.5-pro).
    /// </summary>
    public string ModelFamily { get; set; } = string.Empty;
    
    /// <summary>
    /// Minute window for RPM/TPM tracking (truncated to minute).
    /// </summary>
    public DateTime MinuteWindow { get; set; }
    
    /// <summary>
    /// Number of requests in this minute (RPM counter).
    /// </summary>
    public int RequestsCount { get; set; }
    
    /// <summary>
    /// Number of tokens used in this minute (TPM counter).
    /// </summary>
    public int TokensCount { get; set; }
    
    /// <summary>
    /// Date in Pacific timezone for RPD tracking.
    /// RPD resets at midnight Pacific Time per Google docs.
    /// </summary>
    public DateOnly PacificDate { get; set; }
    
    /// <summary>
    /// Number of requests today (RPD counter).
    /// </summary>
    public int DailyRequests { get; set; }
    
    /// <summary>
    /// Last update timestamp.
    /// </summary>
    public DateTime UpdatedAt { get; set; }
}












