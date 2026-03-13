using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

[ApiController]
[Route("api/ticker")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "alpaca")]
public class TickerController : ControllerBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<TickerController> _logger;

    public TickerController(IServiceProvider serviceProvider, ILogger<TickerController> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> AddTicker([FromBody] AlpacaAddTickerRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Symbol))
            return BadRequest(new { errorCode = "VALIDATION_ERROR", message = "Symbol is required" });

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IAlpacaTickerManagementService>();
            var result = await service.AddTickerAsync(request, cancellationToken);

            return result.ResultCode switch
            {
                "NOT_FOUND" => NotFound(new { errorCode = result.ErrorCode, message = result.Message }),
                "ERROR" => BadRequest(new { errorCode = result.ErrorCode, message = result.Message }),
                _ => Ok(new { message = result.Message, data = result.Data })
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in AddTicker");
            return StatusCode(500, new { message = "Failed to add ticker", error = ex.Message });
        }
    }

    [HttpPatch("{id}/toggle")]
    public async Task<IActionResult> ToggleTicker(int id, [FromQuery] string assetType = "stock", CancellationToken cancellationToken = default)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IAlpacaTickerManagementService>();
            var result = await service.ToggleTickerAsync(id, assetType, cancellationToken);

            if (result.ResultCode == "NOT_FOUND")
                return NotFound(new { errorCode = "NOT_FOUND", message = result.Message });

            return Ok(new { message = result.Message, data = result.Data });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in ToggleTicker");
            return StatusCode(500, new { message = "Failed to toggle ticker", error = ex.Message });
        }
    }
}
