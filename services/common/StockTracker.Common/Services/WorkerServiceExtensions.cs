using Microsoft.Extensions.DependencyInjection;

namespace StockTracker.Common.Services;

/// <summary>
/// Extension methods for registering worker services
/// </summary>
public static class WorkerServiceExtensions
{
    /// <summary>
    /// Add worker state management services
    /// </summary>
    public static IServiceCollection AddWorkerState(this IServiceCollection services)
    {
        services.AddSingleton<WorkerStateService>();
        return services;
    }

    /// <summary>
    /// Add worker health check
    /// </summary>
    public static IHealthChecksBuilder AddWorkerHealthCheck(
        this IHealthChecksBuilder builder,
        string name = "worker",
        string[]? tags = null)
    {
        builder.AddCheck<WorkerHealthCheck>(
            name,
            tags: tags ?? ["worker", "ready"]);
        
        return builder;
    }
}





































