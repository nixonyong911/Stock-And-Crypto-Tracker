namespace StockTracker.Data.Entities;

/// <summary>
/// Telegram user session.
/// Represents an active login session for a Telegram user.
/// </summary>
public class TelegramSession
{
    public long Id { get; set; }
    
    /// <summary>
    /// Foreign key to TelegramUser.
    /// </summary>
    public long UserId { get; set; }
    
    /// <summary>
    /// Telegram's unique user ID (denormalized for quick lookups).
    /// </summary>
    public long TelegramUserId { get; set; }
    
    /// <summary>
    /// Telegram chat ID where the session is active.
    /// </summary>
    public long TelegramChatId { get; set; }
    
    /// <summary>
    /// When this session expires (default: 7 days from creation).
    /// </summary>
    public DateTime ExpiresAt { get; set; }
    
    /// <summary>
    /// When the session was created.
    /// </summary>
    public DateTime CreatedAt { get; set; }
    
    /// <summary>
    /// Last activity timestamp.
    /// </summary>
    public DateTime LastActiveAt { get; set; }
    
    /// <summary>
    /// Device/client information as JSON.
    /// </summary>
    public string DeviceInfo { get; set; } = "{}";
    
    /// <summary>
    /// Unique session token for API authentication.
    /// </summary>
    public Guid SessionToken { get; set; }
    
    /// <summary>
    /// UUID for cursor-agent --resume flag.
    /// Enables conversation context persistence across AI interactions.
    /// </summary>
    public Guid? CursorChatId { get; set; }
    
    // Navigation
    public TelegramUser User { get; set; } = null!;
}
