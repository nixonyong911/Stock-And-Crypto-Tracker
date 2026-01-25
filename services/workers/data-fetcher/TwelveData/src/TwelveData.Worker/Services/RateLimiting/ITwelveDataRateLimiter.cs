namespace TwelveData.Worker.Services.RateLimiting;

/// <summary>
/// Traffic Light function for Twelve Data API rate limiting.
/// Must be called before EVERY Twelve Data API request.
/// </summary>
public interface ITwelveDataRateLimiter
{
    /// <summary>
    /// Acquires a rate limit slot. May block/sleep if minute limit is reached.
    /// Returns Queued status if daily limit is reached.
    /// </summary>
    /// <param name="callerType">
    /// "external" - User-facing operations (daily limit: 700)
    /// "internal" - System operations like data fetching (daily limit: 800)
    /// </param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>RateLimitResult indicating whether to proceed, queue, or if failed</returns>
    Task<RateLimitResult> AcquireAsync(string callerType, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Gets current rate limit status without consuming a slot
    /// </summary>
    Task<(int MinuteUsage, int DailyUsage)> GetCurrentUsageAsync();
}
