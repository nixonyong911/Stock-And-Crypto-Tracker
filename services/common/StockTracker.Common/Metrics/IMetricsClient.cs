namespace StockTracker.Common.Metrics;

/// <summary>
/// Client interface for sending metrics to the central metrics service.
/// Workers should inject this interface to record metrics.
/// </summary>
public interface IMetricsClient
{
    /// <summary>
    /// Increment a counter metric
    /// </summary>
    Task IncrementCounterAsync(string name, double value = 1, Dictionary<string, string>? labels = null);
    
    /// <summary>
    /// Set a gauge metric value
    /// </summary>
    Task SetGaugeAsync(string name, double value, Dictionary<string, string>? labels = null);
    
    /// <summary>
    /// Record a histogram observation (e.g., duration)
    /// </summary>
    Task ObserveHistogramAsync(string name, double value, Dictionary<string, string>? labels = null);
    
    /// <summary>
    /// Record a generic metric
    /// </summary>
    Task RecordAsync(MetricPayload payload);
    
    /// <summary>
    /// Record multiple metrics in a batch (more efficient)
    /// </summary>
    Task RecordBatchAsync(IEnumerable<MetricPayload> metrics);
    
    /// <summary>
    /// Convenience method: Record operation started
    /// </summary>
    Task RecordOperationStartedAsync(string operationName, Dictionary<string, string>? labels = null);
    
    /// <summary>
    /// Convenience method: Record operation completed with duration
    /// </summary>
    Task RecordOperationCompletedAsync(string operationName, double durationSeconds, Dictionary<string, string>? labels = null);
    
    /// <summary>
    /// Convenience method: Record operation failed
    /// </summary>
    Task RecordOperationFailedAsync(string operationName, string errorType, Dictionary<string, string>? labels = null);
    
    /// <summary>
    /// Convenience method: Set worker running status
    /// </summary>
    Task SetWorkerStatusAsync(bool isRunning, bool isPaused);
}























