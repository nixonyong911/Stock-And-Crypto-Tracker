namespace StockTracker.Data.Entities;

/// <summary>
/// Audit log for subscription status changes.
/// Records all subscription events for debugging and tracking.
/// </summary>
public class SubscriptionHistory
{
    public long Id { get; set; }
    
    /// <summary>
    /// Foreign key to the users table.
    /// </summary>
    public int UserId { get; set; }
    
    /// <summary>
    /// Stripe subscription ID (e.g., sub_xxxxx).
    /// </summary>
    public string? StripeSubscriptionId { get; set; }
    
    /// <summary>
    /// Event type: created, updated, canceled, trial_end, payment_failed, payment_succeeded, etc.
    /// </summary>
    public string EventType { get; set; } = string.Empty;
    
    /// <summary>
    /// Previous subscription status (null for new subscriptions).
    /// </summary>
    public string? PreviousStatus { get; set; }
    
    /// <summary>
    /// New subscription status.
    /// </summary>
    public string? NewStatus { get; set; }
    
    /// <summary>
    /// Additional metadata as JSON (webhook event details, etc.).
    /// </summary>
    public string Metadata { get; set; } = "{}";
    
    /// <summary>
    /// Stripe event ID for deduplication.
    /// </summary>
    public string? StripeEventId { get; set; }
    
    /// <summary>
    /// When the event occurred.
    /// </summary>
    public DateTime CreatedAt { get; set; }
}
