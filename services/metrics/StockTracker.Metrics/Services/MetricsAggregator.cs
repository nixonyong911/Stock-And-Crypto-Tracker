using System.Collections.Concurrent;
using Prometheus;
using StockTracker.Metrics.Models;

namespace StockTracker.Metrics.Services;

/// <summary>
/// Central service that receives metrics from workers and exposes them to Prometheus
/// </summary>
public interface IMetricsAggregator
{
    void RecordMetric(MetricPayload payload);
    void RecordBatch(MetricBatchPayload batch);
    IEnumerable<WorkerStatus> GetWorkerStatuses();
}

public class MetricsAggregator : IMetricsAggregator
{
    private readonly ILogger<MetricsAggregator> _logger;
    
    // Track registered workers
    private readonly ConcurrentDictionary<string, WorkerStatus> _workers = new();
    
    // Dynamic metric storage - metrics are created on demand
    private readonly ConcurrentDictionary<string, Counter> _counters = new();
    private readonly ConcurrentDictionary<string, Gauge> _gauges = new();
    private readonly ConcurrentDictionary<string, Histogram> _histograms = new();
    
    // Standard histogram buckets
    private static readonly double[] DefaultBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

    public MetricsAggregator(ILogger<MetricsAggregator> logger)
    {
        _logger = logger;
    }

    public void RecordMetric(MetricPayload payload)
    {
        try
        {
            UpdateWorkerStatus(payload.WorkerName);
            
            var metricName = BuildMetricName(payload.WorkerName, payload.Name);
            var labelNames = payload.Labels.Keys.ToArray();
            var labelValues = payload.Labels.Values.ToArray();

            switch (payload.Type)
            {
                case MetricType.Counter:
                    RecordCounter(metricName, payload.Value, labelNames, labelValues);
                    break;
                    
                case MetricType.Gauge:
                    RecordGauge(metricName, payload.Value, labelNames, labelValues);
                    break;
                    
                case MetricType.Histogram:
                    RecordHistogram(metricName, payload.Value, labelNames, labelValues);
                    break;
            }
            
            _logger.LogDebug("Recorded {Type} metric {Name} = {Value} from {Worker}", 
                payload.Type, metricName, payload.Value, payload.WorkerName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recording metric {Name} from {Worker}", 
                payload.Name, payload.WorkerName);
        }
    }

    public void RecordBatch(MetricBatchPayload batch)
    {
        foreach (var metric in batch.Metrics)
        {
            metric.WorkerName = batch.WorkerName; // Ensure worker name is set
            RecordMetric(metric);
        }
    }

    public IEnumerable<WorkerStatus> GetWorkerStatuses()
    {
        return _workers.Values.OrderBy(w => w.WorkerName);
    }

    private void UpdateWorkerStatus(string workerName)
    {
        _workers.AddOrUpdate(
            workerName,
            new WorkerStatus 
            { 
                WorkerName = workerName, 
                LastSeen = DateTime.UtcNow,
                MetricsReceivedTotal = 1
            },
            (_, existing) =>
            {
                existing.LastSeen = DateTime.UtcNow;
                existing.MetricsReceivedTotal++;
                return existing;
            });
    }

    private static string BuildMetricName(string workerName, string metricName)
    {
        // Format: worker_metricname (e.g., alphavantage_fetch_operations_total)
        var sanitizedWorker = SanitizeName(workerName);
        var sanitizedMetric = SanitizeName(metricName);
        return $"{sanitizedWorker}_{sanitizedMetric}";
    }

    private static string SanitizeName(string name)
    {
        // Prometheus metric names must match [a-zA-Z_:][a-zA-Z0-9_:]*
        return name.ToLowerInvariant()
            .Replace("-", "_")
            .Replace(".", "_")
            .Replace(" ", "_");
    }

    private void RecordCounter(string name, double value, string[] labelNames, string[] labelValues)
    {
        var counter = _counters.GetOrAdd(name, n =>
        {
            _logger.LogInformation("Creating counter: {Name} with labels [{Labels}]", n, string.Join(", ", labelNames));
            return Prometheus.Metrics.CreateCounter(n, $"Counter for {n}", new CounterConfiguration
            {
                LabelNames = labelNames
            });
        });

        if (labelValues.Length > 0)
            counter.WithLabels(labelValues).Inc(value);
        else
            counter.Inc(value);
    }

    private void RecordGauge(string name, double value, string[] labelNames, string[] labelValues)
    {
        var gauge = _gauges.GetOrAdd(name, n =>
        {
            _logger.LogInformation("Creating gauge: {Name} with labels [{Labels}]", n, string.Join(", ", labelNames));
            return Prometheus.Metrics.CreateGauge(n, $"Gauge for {n}", new GaugeConfiguration
            {
                LabelNames = labelNames
            });
        });

        if (labelValues.Length > 0)
            gauge.WithLabels(labelValues).Set(value);
        else
            gauge.Set(value);
    }

    private void RecordHistogram(string name, double value, string[] labelNames, string[] labelValues)
    {
        var histogram = _histograms.GetOrAdd(name, n =>
        {
            _logger.LogInformation("Creating histogram: {Name} with labels [{Labels}]", n, string.Join(", ", labelNames));
            return Prometheus.Metrics.CreateHistogram(n, $"Histogram for {n}", new HistogramConfiguration
            {
                LabelNames = labelNames,
                Buckets = DefaultBuckets
            });
        });

        if (labelValues.Length > 0)
            histogram.WithLabels(labelValues).Observe(value);
        else
            histogram.Observe(value);
    }
}





















