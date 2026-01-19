namespace StockTracker.Data.Entities;

/// <summary>
/// Stripe subscription for a user.
/// Stores active subscription state synced from Stripe webhooks.
/// </summary>
public class Subscription
{
    public long Id { get; set; }
    
    /// <summary>
    /// Foreign key to the users table.
    /// </summary>
    public int UserId { get; set; }
    
    /// <summary>
    /// Stripe subscription ID (e.g., sub_xxxxx).
    /// </summary>
    public string StripeSubscriptionId { get; set; } = string.Empty;
    
    /// <summary>
    /// Stripe price ID for the current plan (e.g., price_xxxxx).
    /// </summary>
    public string StripePriceId { get; set; } = string.Empty;
    
    /// <summary>
    /// Stripe product ID (e.g., prod_xxxxx).
    /// </summary>
    public string StripeProductId { get; set; } = string.Empty;
    
    /// <summary>
    /// Subscription status: active, trialing, past_due, canceled, incomplete, etc.
    /// </summary>
    public string Status { get; set; } = string.Empty;
    
    /// <summary>
    /// Billing interval: month or year.
    /// </summary>
    public string Interval { get; set; } = string.Empty;
    
    /// <summary>
    /// Start of current billing period.
    /// </summary>
    public DateTime CurrentPeriodStart { get; set; }
    
    /// <summary>
    /// End of current billing period (when next charge occurs or subscription ends).
    /// </summary>
    public DateTime CurrentPeriodEnd { get; set; }
    
    /// <summary>
    /// Whether subscription will cancel at period end.
    /// </summary>
    public bool CancelAtPeriodEnd { get; set; }
    
    /// <summary>
    /// When the subscription was canceled (null if not canceled).
    /// </summary>
    public DateTime? CanceledAt { get; set; }
    
    /// <summary>
    /// Trial period start (null if no trial).
    /// </summary>
    public DateTime? TrialStart { get; set; }
    
    /// <summary>
    /// Trial period end (null if no trial).
    /// </summary>
    public DateTime? TrialEnd { get; set; }
    
    /// <summary>
    /// When the subscription was created.
    /// </summary>
    public DateTime CreatedAt { get; set; }
    
    /// <summary>
    /// When the subscription was last updated.
    /// </summary>
    public DateTime UpdatedAt { get; set; }
}
