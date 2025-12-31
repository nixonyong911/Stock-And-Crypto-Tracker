namespace StockTracker.Common.Metrics;

/// <summary>
/// Type of metric to record
/// </summary>
public enum MetricType
{
    Counter,
    Gauge,
    Histogram
}

/// <summary>
/// Payload for a single metric
/// </summary>
public class MetricPayload
{
    public string WorkerName { get; set; } = string.Empty;
    public MetricType Type { get; set; }
    public string Name { get; set; } = string.Empty;
    public double Value { get; set; }
    public Dictionary<string, string> Labels { get; set; } = new();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Batch of metrics
/// </summary>
public class MetricBatchPayload
{
    public string WorkerName { get; set; } = string.Empty;
    public List<MetricPayload> Metrics { get; set; } = new();
}

/// <summary>
/// Response from metrics service
/// </summary>
public class MetricResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int MetricsRecorded { get; set; }
}


























