namespace TwelveData.Worker.Services.RateLimiting;

/// <summary>
/// Result of a rate limit acquisition attempt
/// </summary>
public record RateLimitResult
{
    public RateLimitStatus Status { get; init; }
    
    /// <summary>
    /// Current minute usage after this request
    /// </summary>
    public int MinuteUsage { get; init; }
    
    /// <summary>
    /// Current daily usage after this request
    /// </summary>
    public int DailyUsage { get; init; }
    
    /// <summary>
    /// Seconds waited for rate limit (if any)
    /// </summary>
    public int SecondsWaited { get; init; }
    
    /// <summary>
    /// Error message if failed
    /// </summary>
    public string? ErrorMessage { get; init; }
    
    public static RateLimitResult GreenLight(int minuteUsage, int dailyUsage, int secondsWaited = 0) => new()
    {
        Status = RateLimitStatus.GreenLight,
        MinuteUsage = minuteUsage,
        DailyUsage = dailyUsage,
        SecondsWaited = secondsWaited
    };
    
    public static RateLimitResult Queued(int dailyUsage) => new()
    {
        Status = RateLimitStatus.Queued,
        DailyUsage = dailyUsage,
        ErrorMessage = "Daily rate limit reached. Request queued for processing after midnight UTC."
    };
    
    public static RateLimitResult Failed(string error) => new()
    {
        Status = RateLimitStatus.Failed,
        ErrorMessage = error
    };
}

public enum RateLimitStatus
{
    /// <summary>
    /// Proceed with the API call
    /// </summary>
    GreenLight,
    
    /// <summary>
    /// Daily limit reached - request queued for later
    /// </summary>
    Queued,
    
    /// <summary>
    /// Rate limiting failed (Redis error, etc.)
    /// </summary>
    Failed
}
