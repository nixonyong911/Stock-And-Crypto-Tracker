using System.Net;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

public static class FinnhubResiliencePolicies
{
    private static readonly HashSet<HttpStatusCode> TransientStatusCodes =
    [
        HttpStatusCode.TooManyRequests,
        HttpStatusCode.InternalServerError,
        HttpStatusCode.BadGateway,
        HttpStatusCode.ServiceUnavailable,
        HttpStatusCode.GatewayTimeout
    ];

    private static readonly HashSet<HttpStatusCode> PermanentStatusCodes =
    [
        HttpStatusCode.Unauthorized,
        HttpStatusCode.Forbidden,
        HttpStatusCode.NotFound
    ];

    public static bool IsTransientError(Exception ex)
    {
        if (ex is HttpRequestException httpEx)
        {
            if (httpEx.StatusCode is null) return true;
            return TransientStatusCodes.Contains(httpEx.StatusCode.Value);
        }

        if (ex is TaskCanceledException tce && tce.InnerException is TimeoutException)
            return true;

        return false;
    }

    public static bool IsPermanentError(Exception ex)
    {
        return ex is HttpRequestException { StatusCode: not null } httpEx
            && PermanentStatusCodes.Contains(httpEx.StatusCode.Value);
    }

    public static TimeSpan[] GetRetryDelays(int maxRetries = 3)
    {
        var delays = new TimeSpan[maxRetries];
        for (var i = 0; i < maxRetries; i++)
            delays[i] = TimeSpan.FromSeconds(Math.Pow(2, i + 1));
        return delays;
    }

    /// <summary>
    /// Executes an action with retry logic for transient errors.
    /// Pass <paramref name="delayOverride"/> in tests to avoid real delays.
    /// </summary>
    public static async Task<T?> ExecuteWithRetryAsync<T>(
        Func<Task<T?>> action,
        int maxRetries,
        ILogger logger,
        string operationName,
        CancellationToken ct,
        TimeSpan[]? delayOverride = null)
    {
        var delays = delayOverride ?? GetRetryDelays(maxRetries);

        for (var attempt = 0; attempt <= maxRetries; attempt++)
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                return await action();
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                if (IsPermanentError(ex))
                {
                    logger.LogWarning(ex, "{Operation}: permanent error, not retrying", operationName);
                    return default;
                }

                if (IsTransientError(ex) && attempt < maxRetries)
                {
                    var delay = attempt < delays.Length ? delays[attempt] : delays[^1];
                    logger.LogWarning(ex,
                        "{Operation}: transient error, retry {Attempt}/{MaxRetries} after {Delay}s",
                        operationName, attempt + 1, maxRetries, delay.TotalSeconds);
                    await Task.Delay(delay, ct);
                    continue;
                }

                logger.LogWarning(ex, "{Operation}: all retries exhausted", operationName);
                return default;
            }
        }

        return default;
    }
}
