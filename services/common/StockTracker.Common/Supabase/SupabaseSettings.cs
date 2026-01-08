namespace StockTracker.Common.Supabase;

/// <summary>
/// Configuration settings for Supabase connection
/// </summary>
public class SupabaseSettings
{
    public const string SectionName = "Supabase";
    
    /// <summary>
    /// Supabase project URL (e.g., https://xxx.supabase.co)
    /// </summary>
    public string Url { get; set; } = string.Empty;
    
    /// <summary>
    /// Anonymous/public key for client-side operations (respects RLS)
    /// </summary>
    public string AnonKey { get; set; } = string.Empty;
    
    /// <summary>
    /// Service role key for server-side operations (bypasses RLS)
    /// </summary>
    public string ServiceRoleKey { get; set; } = string.Empty;
}



































