using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Polly;
using Polly.Extensions.Http;

namespace StockTracker.Common.Metrics;

/// <summary>
/// Extension methods for registering metrics client services
/// </summary>
public static class MetricsServiceExtensions
{
    /// <summary>
    /// Add the metrics client to the service collection
    /// </summary>
    /// <param name="services">Service collection</param>
    /// <param name="configuration">Configuration (reads from "MetricsService" section)</param>
    /// <returns>Service collection for chaining</returns>
    public static IServiceCollection AddMetricsClient(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Bind configuration
        services.Configure<MetricsClientOptions>(
            configuration.GetSection(MetricsClientOptions.SectionName));

        var options = configuration
            .GetSection(MetricsClientOptions.SectionName)
            .Get<MetricsClientOptions>() ?? new MetricsClientOptions();

        // Register HTTP client with retry policy
        services.AddHttpClient<IMetricsClient, MetricsClient>(client =>
        {
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
        })
        .AddPolicyHandler(GetRetryPolicy());

        return services;
    }

    /// <summary>
    /// Add the metrics client with explicit options
    /// </summary>
    /// <param name="services">Service collection</param>
    /// <param name="configureOptions">Options configuration action</param>
    /// <returns>Service collection for chaining</returns>
    public static IServiceCollection AddMetricsClient(
        this IServiceCollection services,
        Action<MetricsClientOptions> configureOptions)
    {
        var options = new MetricsClientOptions();
        configureOptions(options);

        services.Configure<MetricsClientOptions>(opt =>
        {
            opt.BaseUrl = options.BaseUrl;
            opt.WorkerName = options.WorkerName;
            opt.Enabled = options.Enabled;
            opt.TimeoutSeconds = options.TimeoutSeconds;
        });

        services.AddHttpClient<IMetricsClient, MetricsClient>(client =>
        {
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
        })
        .AddPolicyHandler(GetRetryPolicy());

        return services;
    }

    private static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy()
    {
        return HttpPolicyExtensions
            .HandleTransientHttpError()
            .WaitAndRetryAsync(2, retryAttempt =>
                TimeSpan.FromMilliseconds(100 * Math.Pow(2, retryAttempt)));
    }
}













