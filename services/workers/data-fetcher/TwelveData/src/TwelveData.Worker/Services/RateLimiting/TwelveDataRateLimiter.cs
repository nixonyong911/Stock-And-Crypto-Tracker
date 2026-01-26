using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using TwelveData.Worker.Configuration;

namespace TwelveData.Worker.Services.RateLimiting;

/// <summary>
/// Traffic Light function for Twelve Data API rate limiting.
/// Uses Redis for atomic counters with automatic TTL-based cleanup.
///
/// Rate Limits (Free Tier):
/// - 8 API calls per minute
/// - 800 API calls per day (resets at midnight UTC)
///
/// External callers (user-facing) are limited to 700/day to reserve buffer for internal operations.
/// </summary>
public class TwelveDataRateLimiter : ITwelveDataRateLimiter
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<TwelveDataRateLimiter> _logger;

    // Rate limit constants (hardcoded as per requirements)
    private const int MinuteLimit = 8;
    private const int DailyLimitInternal = 800;
    private const int DailyLimitExternal = 700;  // Reserve 100 for internal operations

    // TTL values
    private const int MinuteTtlSeconds = 60;

    // Redis key prefixes
    private const string MinuteKeyPrefix = "twelvedata:minute:";
    private const string DailyKeyPrefix = "twelvedata:daily:";

    public TwelveDataRateLimiter(
        IConnectionMultiplexer redis,
        ILogger<TwelveDataRateLimiter> logger)
    {
        _redis = redis;
        _logger = logger;
    }

    public async Task<RateLimitResult> AcquireAsync(string callerType, CancellationToken cancellationToken = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var dailyLimit = callerType == "external" ? DailyLimitExternal : DailyLimitInternal;
            var totalSecondsWaited = 0;

            // Step 1: Check daily limit first
            var dailyKey = GetDailyKey();
            var currentDailyUsage = (int)(await db.StringGetAsync(dailyKey));

            if (currentDailyUsage >= dailyLimit)
            {
                _logger.LogWarning(
                    "Daily rate limit reached for {CallerType}. Usage: {Usage}/{Limit}. Request will be queued.",
                    callerType, currentDailyUsage, dailyLimit);
                return RateLimitResult.Queued(currentDailyUsage);
            }

            // Step 2: Check minute limit with retry/sleep logic
            while (true)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var minuteKey = GetMinuteKey();
                var currentMinuteUsage = (int)(await db.StringGetAsync(minuteKey));

                if (currentMinuteUsage < MinuteLimit)
                {
                    // Slot available - atomically increment both counters
                    var transaction = db.CreateTransaction();

                    // Increment minute counter with TTL
                    // Note: In Redis transactions, commands are queued and executed together.
                    // The tasks complete after ExecuteAsync(), so we don't await them here.
                    var minuteIncrTask = transaction.StringIncrementAsync(minuteKey);
                    _ = transaction.KeyExpireAsync(minuteKey, TimeSpan.FromSeconds(MinuteTtlSeconds));

                    // Increment daily counter with TTL (expires at midnight UTC when TwelveData resets)
                    var dailyIncrTask = transaction.StringIncrementAsync(dailyKey);
                    _ = transaction.KeyExpireAsync(dailyKey, TimeSpan.FromSeconds(GetSecondsUntilMidnightUtc()));

                    if (await transaction.ExecuteAsync())
                    {
                        var newMinuteUsage = (int)(await minuteIncrTask);
                        var newDailyUsage = (int)(await dailyIncrTask);

                        _logger.LogDebug(
                            "Rate limit acquired for {CallerType}. Minute: {MinuteUsage}/{MinuteLimit}, Daily: {DailyUsage}/{DailyLimit}, Waited: {SecondsWaited}s",
                            callerType, newMinuteUsage, MinuteLimit, newDailyUsage, dailyLimit, totalSecondsWaited);

                        return RateLimitResult.GreenLight(newMinuteUsage, newDailyUsage, totalSecondsWaited);
                    }

                    // Transaction failed (concurrent modification) - retry
                    _logger.LogDebug("Rate limit transaction failed, retrying...");
                    continue;
                }

                // Minute limit reached - calculate sleep time until next minute
                var sleepSeconds = CalculateSleepSecondsToNextMinute();

                _logger.LogInformation(
                    "Minute rate limit reached ({Usage}/{Limit}). Sleeping {Seconds}s until next minute.",
                    currentMinuteUsage, MinuteLimit, sleepSeconds);

                await Task.Delay(TimeSpan.FromSeconds(sleepSeconds), cancellationToken);
                totalSecondsWaited += sleepSeconds;

                // Re-check daily limit after sleeping (it might have been reached by other requests)
                currentDailyUsage = (int)(await db.StringGetAsync(dailyKey));
                if (currentDailyUsage >= dailyLimit)
                {
                    _logger.LogWarning(
                        "Daily rate limit reached after minute sleep. Usage: {Usage}/{Limit}. Request will be queued.",
                        currentDailyUsage, dailyLimit);
                    return RateLimitResult.Queued(currentDailyUsage);
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (RedisException ex)
        {
            _logger.LogError(ex, "Redis error during rate limit acquisition");
            return RateLimitResult.Failed($"Redis error: {ex.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during rate limit acquisition");
            return RateLimitResult.Failed($"Unexpected error: {ex.Message}");
        }
    }

    public async Task<(int MinuteUsage, int DailyUsage)> GetCurrentUsageAsync()
    {
        try
        {
            var db = _redis.GetDatabase();

            var minuteKey = GetMinuteKey();
            var dailyKey = GetDailyKey();

            var minuteUsage = (int)(await db.StringGetAsync(minuteKey));
            var dailyUsage = (int)(await db.StringGetAsync(dailyKey));

            return (minuteUsage, dailyUsage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting current rate limit usage");
            return (0, 0);
        }
    }

    /// <summary>
    /// Gets the Redis key for the current minute window.
    /// Format: twelvedata:minute:{unix_timestamp_truncated_to_minute}
    /// </summary>
    private static string GetMinuteKey()
    {
        var now = DateTimeOffset.UtcNow;
        var minuteTimestamp = (now.ToUnixTimeSeconds() / 60) * 60;  // Truncate to minute
        return $"{MinuteKeyPrefix}{minuteTimestamp}";
    }

    /// <summary>
    /// Gets the Redis key for the current day.
    /// Format: twelvedata:daily:{yyyyMMdd}
    /// </summary>
    private static string GetDailyKey()
    {
        return $"{DailyKeyPrefix}{DateTime.UtcNow:yyyyMMdd}";
    }

    /// <summary>
    /// Calculates the number of seconds to sleep until the next minute boundary.
    /// Uses Unix timestamps for accuracy.
    /// </summary>
    private static int CalculateSleepSecondsToNextMinute()
    {
        var now = DateTimeOffset.UtcNow;
        var secondsIntoMinute = (int)(now.ToUnixTimeSeconds() % 60);
        var sleepSeconds = 60 - secondsIntoMinute;

        // Add 1 second buffer to ensure we're in the new minute
        return sleepSeconds + 1;
    }

    /// <summary>
    /// Calculates seconds remaining until midnight UTC.
    /// This ensures the daily counter expires when TwelveData resets their limit.
    /// </summary>
    private static int GetSecondsUntilMidnightUtc()
    {
        var now = DateTime.UtcNow;
        var midnight = now.Date.AddDays(1);
        return (int)(midnight - now).TotalSeconds;
    }
}
