using Microsoft.AspNetCore.Mvc;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class FetchController : ControllerBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FetchController> _logger;

    public FetchController(
        IServiceProvider serviceProvider,
        ILogger<FetchController> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    /// <summary>
    /// Trigger fetch for a specific symbol. Creates the ticker if it doesn't exist.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., AAPL, MSFT, GOOGL)</param>
    /// <param name="date">Optional date to fetch. Format: "YYYY-MM-DD" (e.g., "2025-12-24") or "yesterday". Defaults to "yesterday" if not provided.</param>
    [HttpPost("trigger/{symbol}")]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<FetchResponse>> TriggerFetchSymbol(
        string symbol, 
        [FromQuery] string? date = null)
    {
        if (string.IsNullOrWhiteSpace(symbol))
        {
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = "Symbol is required."
            });
        }

        symbol = symbol.ToUpperInvariant();
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;
        
        _logger.LogInformation("Manual fetch triggered for symbol {Symbol} with date {Date} via API", symbol, fetchDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var fetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();

            var recordsInserted = await fetchService.FetchSymbolAsync(symbol, date);

            return Ok(new FetchResponse
            {
                Success = true,
                Message = $"Fetched {recordsInserted} records for symbol {symbol} (date: {fetchDate}).",
                RecordsInserted = recordsInserted,
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Configuration error fetching symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = ex.Message,
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "API error fetching symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = $"TwelveData API error: {ex.Message}",
                Symbol = symbol,
                Date = fetchDate
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching symbol {Symbol}", symbol);
            return StatusCode(500, new FetchResponse
            {
                Success = false,
                Message = $"Internal error: {ex.Message}",
                Symbol = symbol,
                Date = fetchDate
            });
        }
    }

    /// <summary>
    /// Trigger fetch for all active tickers. Useful for cron jobs and batch operations.
    /// </summary>
    /// <param name="date">Optional date to fetch. Format: "YYYY-MM-DD" or "yesterday". Defaults to "yesterday".</param>
    [HttpPost("trigger/all")]
    [ProducesResponseType(typeof(BatchFetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(BatchFetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<BatchFetchResponse>> TriggerFetchAll([FromQuery] string? date = null)
    {
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;
        
        _logger.LogInformation("Batch fetch triggered for all active tickers with date {Date} via API", fetchDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var fetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();

            var result = await fetchService.FetchAllActiveTickersAsync(date);

            return Ok(new BatchFetchResponse
            {
                Success = result.FailedCount == 0,
                Message = $"Batch fetch completed: {result.SuccessCount} succeeded, {result.FailedCount} failed, {result.TotalRecordsInserted} records inserted.",
                Date = fetchDate,
                SuccessCount = result.SuccessCount,
                FailedCount = result.FailedCount,
                TotalRecordsInserted = result.TotalRecordsInserted,
                Results = result.SymbolResults.Select(r => new SymbolFetchResult
                {
                    Symbol = r.Symbol,
                    Success = r.Success,
                    RecordsInserted = r.RecordsInserted,
                    Error = r.Error
                }).ToList()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during batch fetch");
            return StatusCode(500, new BatchFetchResponse
            {
                Success = false,
                Message = $"Batch fetch error: {ex.Message}",
                Date = fetchDate
            });
        }
    }

    /// <summary>
    /// Get service status and configuration info
    /// </summary>
    [HttpGet("status")]
    [ProducesResponseType(typeof(StatusResponse), StatusCodes.Status200OK)]
    public ActionResult<StatusResponse> GetStatus()
    {
        return Ok(new StatusResponse
        {
            Service = "TwelveData Fetcher",
            Status = "Running",
            DefaultConfig = new ConfigInfo
            {
                FetchDate = "yesterday",
                Interval = "15min",
                OutputSize = 30,
                Exchange = "NASDAQ",
                Timezone = "America/New_York"
            }
        });
    }
}

// Response DTOs
public class FetchResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Symbol { get; set; }
    public string? Date { get; set; }
    public int? RecordsInserted { get; set; }
}

public class StatusResponse
{
    public string Service { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public ConfigInfo DefaultConfig { get; set; } = new();
}

public class ConfigInfo
{
    public string FetchDate { get; set; } = string.Empty;
    public string Interval { get; set; } = string.Empty;
    public int OutputSize { get; set; }
    public string Exchange { get; set; } = string.Empty;
    public string Timezone { get; set; } = string.Empty;
}

public class BatchFetchResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Date { get; set; }
    public int SuccessCount { get; set; }
    public int FailedCount { get; set; }
    public int TotalRecordsInserted { get; set; }
    public List<SymbolFetchResult>? Results { get; set; }
}

public class SymbolFetchResult
{
    public string Symbol { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int RecordsInserted { get; set; }
    public string? Error { get; set; }
}

