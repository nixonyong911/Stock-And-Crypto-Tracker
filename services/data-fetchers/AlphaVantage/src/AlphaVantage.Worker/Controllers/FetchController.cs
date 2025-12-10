using AlphaVantage.Worker.Configuration;
using AlphaVantage.Worker.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using StockTracker.Common.Services;

namespace AlphaVantage.Worker.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class FetchController : ControllerBase
{
    private readonly WorkerStateService _workerState;
    private readonly IServiceProvider _serviceProvider;
    private readonly AlphaVantageSettings _settings;
    private readonly ILogger<FetchController> _logger;

    public FetchController(
        WorkerStateService workerState,
        IServiceProvider serviceProvider,
        IOptions<AlphaVantageSettings> settings,
        ILogger<FetchController> logger)
    {
        _workerState = workerState;
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
    }

    /// <summary>
    /// Get the current status of the fetch worker
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(WorkerStatusResponse), StatusCodes.Status200OK)]
    public ActionResult<WorkerStatusResponse> GetStatus()
    {
        var status = _workerState.GetStatus();
        
        return Ok(new WorkerStatusResponse
        {
            IsRunning = status.IsRunning,
            IsPaused = status.IsPaused,
            CurrentStatus = status.CurrentStatus,
            CurrentOperation = status.CurrentOperation,
            LastOperationTime = status.LastOperationTime,
            NextOperationTime = status.NextOperationTime,
            TotalOperationsToday = status.TotalOperationsToday,
            TotalErrorsToday = status.TotalErrorsToday,
            Configuration = new ConfigurationInfo
            {
                FetchIntervalMinutes = _settings.FetchIntervalMinutes,
                Symbols = _settings.Symbols
            }
        });
    }

    /// <summary>
    /// Trigger an immediate fetch operation
    /// </summary>
    [HttpPost("trigger")]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status409Conflict)]
    public ActionResult<TriggerResponse> TriggerFetch()
    {
        var status = _workerState.GetStatus();

        if (status.IsPaused)
        {
            return Conflict(new TriggerResponse
            {
                Success = false,
                Message = "Cannot trigger fetch while worker is paused. Resume the worker first."
            });
        }

        if (status.CurrentStatus == "Working")
        {
            return Conflict(new TriggerResponse
            {
                Success = false,
                Message = "A fetch operation is already in progress."
            });
        }

        _workerState.RequestTrigger();
        _logger.LogInformation("Manual fetch triggered via API");

        return Ok(new TriggerResponse
        {
            Success = true,
            Message = "Fetch operation triggered. The worker will start fetching shortly."
        });
    }

    /// <summary>
    /// Trigger fetch for a specific symbol (runs immediately, bypasses worker)
    /// </summary>
    [HttpPost("trigger/{symbol}")]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TriggerResponse>> TriggerFetchSymbol(string symbol)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new TriggerResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        symbol = symbol.ToUpperInvariant();
        _logger.LogInformation("Manual fetch triggered for symbol {Symbol} via API", symbol);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var fetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();
            
            await fetchService.FetchSymbolAsync(symbol);

            return Ok(new TriggerResponse
            {
                Success = true,
                Message = $"Fetch completed for symbol {symbol}."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching symbol {Symbol}", symbol);
            return BadRequest(new TriggerResponse
            {
                Success = false,
                Message = $"Error fetching symbol {symbol}: {ex.Message}"
            });
        }
    }

    /// <summary>
    /// Pause the fetch worker
    /// </summary>
    [HttpPost("pause")]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status200OK)]
    public ActionResult<TriggerResponse> Pause()
    {
        _workerState.SetPaused(true);
        _logger.LogInformation("Worker paused via API");

        return Ok(new TriggerResponse
        {
            Success = true,
            Message = "Worker paused. Scheduled fetches will not run until resumed."
        });
    }

    /// <summary>
    /// Resume the fetch worker
    /// </summary>
    [HttpPost("resume")]
    [ProducesResponseType(typeof(TriggerResponse), StatusCodes.Status200OK)]
    public ActionResult<TriggerResponse> Resume()
    {
        _workerState.SetPaused(false);
        _logger.LogInformation("Worker resumed via API");

        return Ok(new TriggerResponse
        {
            Success = true,
            Message = "Worker resumed. Scheduled fetches will continue."
        });
    }
}

// Response DTOs
public class WorkerStatusResponse
{
    public bool IsRunning { get; set; }
    public bool IsPaused { get; set; }
    public string CurrentStatus { get; set; } = string.Empty;
    public string? CurrentOperation { get; set; }
    public DateTime? LastOperationTime { get; set; }
    public DateTime? NextOperationTime { get; set; }
    public int TotalOperationsToday { get; set; }
    public int TotalErrorsToday { get; set; }
    public ConfigurationInfo Configuration { get; set; } = new();
}

public class ConfigurationInfo
{
    public int FetchIntervalMinutes { get; set; }
    public string[] Symbols { get; set; } = [];
}

public class TriggerResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}
