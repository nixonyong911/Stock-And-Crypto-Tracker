using System.Diagnostics;
using System.Net;

namespace DataFetcher.Worker.Application.Providers.Common;

public abstract class DataProviderBase : IDataProviderContract
{
    public abstract string ProviderName { get; }
    public abstract ProviderCapabilities Capabilities { get; }
    public abstract ResilienceConfig GetResilienceConfig();
    public abstract Task<HealthCheckResult> HealthCheckAsync(CancellationToken ct);

    private static readonly HashSet<HttpStatusCode> TransientStatusCodes =
    [
        HttpStatusCode.TooManyRequests,
        HttpStatusCode.InternalServerError,
        HttpStatusCode.BadGateway,
        HttpStatusCode.ServiceUnavailable,
        HttpStatusCode.GatewayTimeout
    ];

    protected async Task<T?> ExecuteWithResilienceAsync<T>(
        Func<Task<T?>> action,
        string operationName,
        ILogger logger,
        CancellationToken ct) where T : class
    {
        var config = GetResilienceConfig();

        for (var attempt = 0; attempt <= config.MaxRetries; attempt++)
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(config.RequestTimeout);
                return await action();
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex) when (attempt < config.MaxRetries && IsTransientError(ex))
            {
                var delay = TimeSpan.FromSeconds(
                    config.InitialRetryDelay.TotalSeconds * Math.Pow(2, attempt));
                logger.LogWarning(ex,
                    "{Provider}/{Operation}: transient error, retry {Attempt}/{Max} after {Delay}s",
                    ProviderName, operationName, attempt + 1, config.MaxRetries, delay.TotalSeconds);
                await Task.Delay(delay, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "{Provider}/{Operation}: non-transient error after {Attempts} attempts",
                    ProviderName, operationName, attempt + 1);
                return default;
            }
        }

        return default;
    }

    protected async Task<HealthCheckResult> PingHealthAsync(
        Func<Task> pingAction, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(10));
            await pingAction();
            return new HealthCheckResult(true, Latency: sw.Elapsed);
        }
        catch (Exception ex)
        {
            return new HealthCheckResult(false, ex.Message, sw.Elapsed);
        }
    }

    private static bool IsTransientError(Exception ex)
    {
        if (ex is HttpRequestException httpEx)
        {
            if (httpEx.StatusCode is null) return true;
            return TransientStatusCodes.Contains(httpEx.StatusCode.Value);
        }
        return ex is TaskCanceledException tce && tce.InnerException is TimeoutException;
    }
}
