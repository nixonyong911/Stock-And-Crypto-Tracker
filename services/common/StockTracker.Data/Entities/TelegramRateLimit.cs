namespace StockTracker.Data.Entities;

/// <summary>
/// Rate limiting for Telegram bot actions.
/// Tracks attempts for rate-limited actions like registration and login.
/// </summary>
public class TelegramRateLimit
{
    public long Id { get; set; }
    
    /// <summary>
    /// Telegram's unique user ID.
    /// </summary>
    public long TelegramUserId { get; set; }
    
    /// <summary>
    /// Type of action being rate limited ('register', 'login').
    /// </summary>
    public string ActionType { get; set; } = string.Empty;
    
    /// <summary>
    /// Number of attempts in the current window.
    /// </summary>
    public int AttemptCount { get; set; } = 1;
    
    /// <summary>
    /// Start of the current rate limit window.
    /// </summary>
    public DateTime WindowStart { get; set; }
}
