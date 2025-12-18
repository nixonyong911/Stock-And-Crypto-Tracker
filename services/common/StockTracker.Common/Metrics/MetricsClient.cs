using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace StockTracker.Common.Metrics;

/// <summary>
/// HTTP client implementation that sends metrics to the central metrics service
/// </summary>
public class MetricsClient : IMetricsClient
{
    private readonly HttpClient _httpClient;
    private readonly MetricsClientOptions _options;
    private readonly ILogger<MetricsClient> _logger;

    public MetricsClient(
        HttpClient httpClient,
        IOptions<MetricsClientOptions> options,
        ILogger<MetricsClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task IncrementCounterAsync(string name, double value = 1, Dictionary<string, string>? labels = null)
    {
        await RecordAsync(new MetricPayload
        {
            WorkerName = _options.WorkerName,
            Type = MetricType.Counter,
            Name = name,
            Value = value,
            Labels = labels ?? new()
        });
    }

    public async Task SetGaugeAsync(string name, double value, Dictionary<string, string>? labels = null)
    {
        await RecordAsync(new MetricPayload
        {
            WorkerName = _options.WorkerName,
            Type = MetricType.Gauge,
            Name = name,
            Value = value,
            Labels = labels ?? new()
        });
    }

    public async Task ObserveHistogramAsync(string name, double value, Dictionary<string, string>? labels = null)
    {
        await RecordAsync(new MetricPayload
        {
            WorkerName = _options.WorkerName,
            Type = MetricType.Histogram,
            Name = name,
            Value = value,
            Labels = labels ?? new()
        });
    }

    public async Task RecordAsync(MetricPayload payload)
    {
        if (!_options.Enabled)
        {
            _logger.LogDebug("Metrics disabled, skipping {MetricName}", payload.Name);
            return;
        }

        try
        {
            payload.WorkerName = _options.WorkerName;
            var response = await _httpClient.PostAsJsonAsync("/api/metrics", payload);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to send metric {Name}: {StatusCode}", 
                    payload.Name, response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending metric {Name} to metrics service", payload.Name);
            // Don't throw - metrics should not break the worker
        }
    }

    public async Task RecordBatchAsync(IEnumerable<MetricPayload> metrics)
    {
        if (!_options.Enabled)
        {
            _logger.LogDebug("Metrics disabled, skipping batch");
            return;
        }

        try
        {
            var batch = new MetricBatchPayload
            {
                WorkerName = _options.WorkerName,
                Metrics = metrics.ToList()
            };

            var response = await _httpClient.PostAsJsonAsync("/api/metrics/batch", batch);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to send metric batch: {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending metric batch to metrics service");
        }
    }

    public async Task RecordOperationStartedAsync(string operationName, Dictionary<string, string>? labels = null)
    {
        var allLabels = new Dictionary<string, string>(labels ?? new())
        {
            ["status"] = "started"
        };
        await IncrementCounterAsync($"{operationName}_total", 1, allLabels);
    }

    public async Task RecordOperationCompletedAsync(string operationName, double durationSeconds, Dictionary<string, string>? labels = null)
    {
        var allLabels = new Dictionary<string, string>(labels ?? new())
        {
            ["status"] = "completed"
        };
        
        await RecordBatchAsync(new[]
        {
            new MetricPayload
            {
                Type = MetricType.Counter,
                Name = $"{operationName}_total",
                Value = 1,
                Labels = allLabels
            },
            new MetricPayload
            {
                Type = MetricType.Histogram,
                Name = $"{operationName}_duration_seconds",
                Value = durationSeconds,
                Labels = labels ?? new()
            }
        });
    }

    public async Task RecordOperationFailedAsync(string operationName, string errorType, Dictionary<string, string>? labels = null)
    {
        var allLabels = new Dictionary<string, string>(labels ?? new())
        {
            ["status"] = "failed",
            ["error_type"] = errorType
        };
        await IncrementCounterAsync($"{operationName}_total", 1, allLabels);
        await IncrementCounterAsync($"{operationName}_errors_total", 1, new Dictionary<string, string>
        {
            ["error_type"] = errorType
        });
    }

    public async Task SetWorkerStatusAsync(bool isRunning, bool isPaused)
    {
        await RecordBatchAsync(new[]
        {
            new MetricPayload
            {
                Type = MetricType.Gauge,
                Name = "worker_running",
                Value = isRunning ? 1 : 0
            },
            new MetricPayload
            {
                Type = MetricType.Gauge,
                Name = "worker_paused",
                Value = isPaused ? 1 : 0
            }
        });
    }
}

/// <summary>
/// Configuration options for the metrics client
/// </summary>
public class MetricsClientOptions
{
    public const string SectionName = "MetricsService";
    
    /// <summary>
    /// Base URL of the metrics service (e.g., http://metrics-service:8080)
    /// </summary>
    public string BaseUrl { get; set; } = "http://localhost:8080";
    
    /// <summary>
    /// Name of this worker (used as metric prefix)
    /// </summary>
    public string WorkerName { get; set; } = "unknown";
    
    /// <summary>
    /// Whether metrics are enabled (useful for local development)
    /// </summary>
    public bool Enabled { get; set; } = true;
    
    /// <summary>
    /// Timeout for HTTP requests to metrics service
    /// </summary>
    public int TimeoutSeconds { get; set; } = 5;
}













