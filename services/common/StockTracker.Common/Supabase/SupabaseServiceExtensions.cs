using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace StockTracker.Common.Supabase;

/// <summary>
/// Extension methods for registering Supabase services
/// </summary>
public static class SupabaseServiceExtensions
{
    /// <summary>
    /// Adds Supabase client factory to the service collection
    /// </summary>
    /// <param name="services">The service collection</param>
    /// <param name="configuration">The configuration containing Supabase settings</param>
    /// <returns>The service collection for chaining</returns>
    /// <example>
    /// // In Program.cs
    /// builder.Services.AddSupabase(builder.Configuration);
    /// 
    /// // In appsettings.json
    /// {
    ///   "Supabase": {
    ///     "Url": "https://xxx.supabase.co",
    ///     "ServiceRoleKey": "your-service-role-key",
    ///     "AnonKey": "your-anon-key"
    ///   }
    /// }
    /// </example>
    public static IServiceCollection AddSupabase(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<SupabaseSettings>(
            configuration.GetSection(SupabaseSettings.SectionName));
        
        services.AddSingleton<ISupabaseClientFactory, SupabaseClientFactory>();
        
        return services;
    }
}

















