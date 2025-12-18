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
    /// Uses default configuration: yesterday, 15min interval, NASDAQ, 30 candles.
    /// </summary>
    /// <param name="symbol">Stock symbol (e.g., AAPL, MSFT, GOOGL)</param>
    [HttpPost("trigger/{symbol}")]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(FetchResponse), StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<FetchResponse>> TriggerFetchSymbol(string symbol)
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
        _logger.LogInformation("Manual fetch triggered for symbol {Symbol} via API", symbol);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var fetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();

            var recordsInserted = await fetchService.FetchSymbolAsync(symbol);

            return Ok(new FetchResponse
            {
                Success = true,
                Message = $"Fetched {recordsInserted} records for symbol {symbol}.",
                RecordsInserted = recordsInserted,
                Symbol = symbol
            });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Configuration error fetching symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = ex.Message,
                Symbol = symbol
            });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "API error fetching symbol {Symbol}", symbol);
            return BadRequest(new FetchResponse
            {
                Success = false,
                Message = $"TwelveData API error: {ex.Message}",
                Symbol = symbol
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching symbol {Symbol}", symbol);
            return StatusCode(500, new FetchResponse
            {
                Success = false,
                Message = $"Internal error: {ex.Message}",
                Symbol = symbol
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

