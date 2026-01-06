using Microsoft.AspNetCore.Mvc;
using StockTracker.Metrics.Models;
using StockTracker.Metrics.Services;

namespace StockTracker.Metrics.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class MetricsController : ControllerBase
{
    private readonly IMetricsAggregator _aggregator;
    private readonly ILogger<MetricsController> _logger;

    public MetricsController(IMetricsAggregator aggregator, ILogger<MetricsController> logger)
    {
        _aggregator = aggregator;
        _logger = logger;
    }

    /// <summary>
    /// Record a single metric from a worker
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(MetricResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(MetricResponse), StatusCodes.Status400BadRequest)]
    public ActionResult<MetricResponse> RecordMetric([FromBody] MetricPayload payload)
    {
        if (string.IsNullOrWhiteSpace(payload.WorkerName))
        {
            return BadRequest(new MetricResponse
            {
                Success = false,
                Message = "WorkerName is required"
            });
        }

        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            return BadRequest(new MetricResponse
            {
                Success = false,
                Message = "Metric name is required"
            });
        }

        _aggregator.RecordMetric(payload);

        return Ok(new MetricResponse
        {
            Success = true,
            Message = "Metric recorded",
            MetricsRecorded = 1
        });
    }

    /// <summary>
    /// Record a batch of metrics from a worker
    /// </summary>
    [HttpPost("batch")]
    [ProducesResponseType(typeof(MetricResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(MetricResponse), StatusCodes.Status400BadRequest)]
    public ActionResult<MetricResponse> RecordBatch([FromBody] MetricBatchPayload batch)
    {
        if (string.IsNullOrWhiteSpace(batch.WorkerName))
        {
            return BadRequest(new MetricResponse
            {
                Success = false,
                Message = "WorkerName is required"
            });
        }

        if (batch.Metrics == null || batch.Metrics.Count == 0)
        {
            return BadRequest(new MetricResponse
            {
                Success = false,
                Message = "At least one metric is required"
            });
        }

        _aggregator.RecordBatch(batch);

        return Ok(new MetricResponse
        {
            Success = true,
            Message = $"Batch recorded for {batch.WorkerName}",
            MetricsRecorded = batch.Metrics.Count
        });
    }

    /// <summary>
    /// Get status of all registered workers
    /// </summary>
    [HttpGet("workers")]
    [ProducesResponseType(typeof(IEnumerable<WorkerStatus>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<WorkerStatus>> GetWorkers()
    {
        return Ok(_aggregator.GetWorkerStatuses());
    }
}




































