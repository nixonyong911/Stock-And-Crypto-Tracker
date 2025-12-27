namespace StockTracker.Metrics.Models;

/// <summary>
/// Payload sent by workers to record metrics
/// </summary>
public class MetricPayload
{
    /// <summary>
    /// Name of the worker sending the metric (e.g., "alphavantage", "coingecko")
    /// </summary>
    public string WorkerName { get; set; } = string.Empty;
    
    /// <summary>
    /// Type of metric: counter, gauge, histogram
    /// </summary>
    public MetricType Type { get; set; }
    
    /// <summary>
    /// Name of the metric (e.g., "fetch_operations", "api_calls")
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// Value for the metric (increment for counter, absolute for gauge, observation for histogram)
    /// </summary>
    public double Value { get; set; }
    
    /// <summary>
    /// Optional labels for the metric
    /// </summary>
    public Dictionary<string, string> Labels { get; set; } = new();
    
    /// <summary>
    /// Timestamp when the metric was recorded (UTC)
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Batch of metrics sent by a worker
/// </summary>
public class MetricBatchPayload
{
    public string WorkerName { get; set; } = string.Empty;
    public List<MetricPayload> Metrics { get; set; } = new();
}

public enum MetricType
{
    Counter,
    Gauge,
    Histogram
}

/// <summary>
/// Response after recording metrics
/// </summary>
public class MetricResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int MetricsRecorded { get; set; }
}

/// <summary>
/// Status of a registered worker
/// </summary>
public class WorkerStatus
{
    public string WorkerName { get; set; } = string.Empty;
    public DateTime LastSeen { get; set; }
    public int MetricsReceivedTotal { get; set; }
    public bool IsHealthy => DateTime.UtcNow - LastSeen < TimeSpan.FromMinutes(5);
}





















