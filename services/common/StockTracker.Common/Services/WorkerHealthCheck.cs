using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace StockTracker.Common.Services;

/// <summary>
/// Health check for worker services.
/// Reports healthy if the worker is running (even if paused).
/// </summary>
public class WorkerHealthCheck : IHealthCheck
{
    private readonly WorkerStateService _workerState;

    public WorkerHealthCheck(WorkerStateService workerState)
    {
        _workerState = workerState;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var status = _workerState.GetStatus();

        var data = new Dictionary<string, object>
        {
            ["isRunning"] = status.IsRunning,
            ["isPaused"] = status.IsPaused,
            ["currentStatus"] = status.CurrentStatus,
            ["totalOperationsToday"] = status.TotalOperationsToday,
            ["totalErrorsToday"] = status.TotalErrorsToday
        };

        if (status.LastOperationTime.HasValue)
        {
            data["lastOperationTime"] = status.LastOperationTime.Value.ToString("O");
        }

        if (status.NextOperationTime.HasValue)
        {
            data["nextOperationTime"] = status.NextOperationTime.Value.ToString("O");
        }

        // Worker is healthy if it's running (even if paused)
        if (status.IsRunning)
        {
            return Task.FromResult(HealthCheckResult.Healthy(
                $"Worker is {(status.IsPaused ? "paused" : "active")}",
                data));
        }

        return Task.FromResult(HealthCheckResult.Degraded(
            "Worker is not running",
            data: data));
    }
}





















