using Microsoft.AspNetCore.Mvc;
using StockTracker.Common.Supabase;
using StockTracker.Common.Supabase.Models;

namespace AlphaVantage.Worker.Controllers;

/// <summary>
/// Controller for testing Supabase connection
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class SupabaseTestController : ControllerBase
{
    private readonly ISupabaseClientFactory _supabaseFactory;
    private readonly ILogger<SupabaseTestController> _logger;

    public SupabaseTestController(
        ISupabaseClientFactory supabaseFactory,
        ILogger<SupabaseTestController> logger)
    {
        _supabaseFactory = supabaseFactory;
        _logger = logger;
    }

    /// <summary>
    /// Test the Supabase connection by reading from the test table
    /// </summary>
    [HttpGet("connection")]
    public async Task<IActionResult> TestConnection()
    {
        try
        {
            var client = _supabaseFactory.CreateClient(useServiceRole: true);
            
            var response = await client.From<TestModel>().Get();
            
            return Ok(new
            {
                success = true,
                message = "Successfully connected to Supabase!",
                projectUrl = _supabaseFactory.ProjectUrl,
                recordCount = response.Models.Count,
                data = response.Models.Select(m => new
                {
                    m.Id,
                    m.Message,
                    m.CreatedAt
                })
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to Supabase");
            
            return StatusCode(500, new
            {
                success = false,
                message = "Failed to connect to Supabase",
                error = ex.Message,
                projectUrl = _supabaseFactory.ProjectUrl
            });
        }
    }

    /// <summary>
    /// Insert a test record into the test table
    /// </summary>
    [HttpPost("insert")]
    public async Task<IActionResult> InsertTestRecord([FromBody] InsertTestRequest request)
    {
        try
        {
            var client = _supabaseFactory.CreateClient(useServiceRole: true);
            
            var newRecord = new TestModel
            {
                Message = request.Message ?? $"Test from .NET at {DateTime.UtcNow:O}"
            };

            var response = await client.From<TestModel>().Insert(newRecord);
            var inserted = response.Models.FirstOrDefault();
            
            return Ok(new
            {
                success = true,
                message = "Record inserted successfully!",
                data = inserted != null ? new
                {
                    inserted.Id,
                    inserted.Message,
                    inserted.CreatedAt
                } : null
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to insert record into Supabase");
            
            return StatusCode(500, new
            {
                success = false,
                message = "Failed to insert record",
                error = ex.Message
            });
        }
    }
}

public class InsertTestRequest
{
    public string? Message { get; set; }
}


