using DataFetcher.Worker.Application;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for provider discovery.
/// </summary>
[ApiController]
[Route("api/providers")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "general")]
public class ProvidersController : ControllerBase
{
    private readonly IProviderRegistry _registry;
    private readonly ILogger<ProvidersController> _logger;

    public ProvidersController(IProviderRegistry registry, ILogger<ProvidersController> logger)
    {
        _registry = registry;
        _logger = logger;
    }

    /// <summary>
    /// Returns all registered data providers with their capabilities and endpoints.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<ProviderInfo>), 200)]
    public IActionResult GetAll()
    {
        try
        {
            return Ok(_registry.GetAll());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetAll");
            return StatusCode(500, new { message = "Failed to retrieve providers", error = ex.Message });
        }
    }
}
