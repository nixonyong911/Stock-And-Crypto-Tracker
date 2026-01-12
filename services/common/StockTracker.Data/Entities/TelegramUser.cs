namespace StockTracker.Data.Entities;

/// <summary>
/// Telegram user registration.
/// Stores basic user information from Telegram.
/// </summary>
public class TelegramUser
{
    public long Id { get; set; }
    
    /// <summary>
    /// Telegram's unique user ID.
    /// </summary>
    public long TelegramUserId { get; set; }
    
    /// <summary>
    /// User's display name (first_name from Telegram).
    /// </summary>
    public string DisplayName { get; set; } = string.Empty;
    
    /// <summary>
    /// Telegram username (without @), optional.
    /// </summary>
    public string? TelegramUsername { get; set; }
    
    /// <summary>
    /// When the user registered.
    /// </summary>
    public DateTime CreatedAt { get; set; }
    
    // Navigation
    public ICollection<TelegramSession> Sessions { get; set; } = new List<TelegramSession>();
}
