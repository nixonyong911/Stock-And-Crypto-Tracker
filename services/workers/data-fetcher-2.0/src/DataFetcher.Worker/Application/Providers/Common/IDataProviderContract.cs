namespace DataFetcher.Worker.Application.Providers.Common;

public interface IDataProviderContract
{
    string ProviderName { get; }
    ProviderCapabilities Capabilities { get; }
    Task<HealthCheckResult> HealthCheckAsync(CancellationToken ct);
    ResilienceConfig GetResilienceConfig();
}

public record ResilienceConfig(
    int MaxRetries,
    TimeSpan InitialRetryDelay,
    TimeSpan RequestTimeout,
    int CircuitBreakerThreshold,
    TimeSpan CircuitBreakerDuration
);

public record HealthCheckResult(bool Healthy, string? Error = null, TimeSpan Latency = default);
