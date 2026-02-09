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

    public ProvidersController(IProviderRegistry registry)
    {
        _registry = registry;
    }

    /// <summary>
    /// Returns all registered data providers with their capabilities and endpoints.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<ProviderInfo>), 200)]
    public IActionResult GetAll()
    {
        return Ok(_registry.GetAll());
    }
}
