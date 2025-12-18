namespace StockTracker.Common.Supabase;

/// <summary>
/// Factory interface for creating Supabase clients
/// </summary>
public interface ISupabaseClientFactory
{
    /// <summary>
    /// Creates a Supabase client
    /// </summary>
    /// <param name="useServiceRole">If true, uses service role key (bypasses RLS). Default is true for backend services.</param>
    /// <returns>Initialized Supabase client</returns>
    global::Supabase.Client CreateClient(bool useServiceRole = true);
    
    /// <summary>
    /// Gets the Supabase project URL
    /// </summary>
    string ProjectUrl { get; }
}











