using System.Text.Json.Serialization;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

/// <summary>
/// API controller for schedule discovery and management.
/// </summary>
[ApiController]
[Route("api/schedules")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "general")]
public class SchedulesController : ControllerBase
{
    private readonly IFetchScheduleRepository _scheduleRepo;
    private readonly ILogger<SchedulesController> _logger;

    public SchedulesController(IFetchScheduleRepository scheduleRepo, ILogger<SchedulesController> logger)
    {
        _scheduleRepo = scheduleRepo;
        _logger = logger;
    }

    /// <summary>
    /// Returns all registered schedules for service discovery.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ScheduleDiscoveryResponse), 200)]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var schedules = await _scheduleRepo.GetAllSchedulesAsync();

            var response = new ScheduleDiscoveryResponse
            {
                Service = "data-fetcher-2.0",
                Schedules = schedules.Select(MapToDto).ToList()
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetAll");
            return StatusCode(500, new { message = "Failed to retrieve schedules", error = ex.Message });
        }
    }

    /// <summary>
    /// Toggles the is_enabled flag for a schedule.
    /// </summary>
    [HttpPost("{id:int}/toggle")]
    [ProducesResponseType(typeof(ScheduleToggleResponse), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Toggle(int id)
    {
        try
        {
            var schedule = await _scheduleRepo.ToggleScheduleAsync(id);
            if (schedule == null)
            {
                return NotFound(new { message = $"Schedule with ID {id} not found" });
            }

            return Ok(new ScheduleToggleResponse
            {
                Id = schedule.Id,
                Name = schedule.Name,
                IsEnabled = schedule.IsEnabled,
                Message = $"Schedule '{schedule.Name}' is now {(schedule.IsEnabled ? "enabled" : "disabled")}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in Toggle");
            return StatusCode(500, new { message = "Failed to toggle schedule", error = ex.Message });
        }
    }

    private static ScheduleDiscoveryItem MapToDto(FetchSchedule s)
    {
        bool isInterval = s.IntervalMinutes is > 0;

        return new ScheduleDiscoveryItem
        {
            Id = s.Id,
            Name = s.Name,
            Description = s.Description,
            IsEnabled = s.IsEnabled,
            CadenceType = isInterval ? "interval" : "daily",
            Cadence = isInterval
                ? $"Every {s.IntervalMinutes} min (offset: {s.OffsetMinutes} min)"
                : $"Daily at {s.ScheduleTime} {s.ScheduleTimezone}",
            IntervalMinutes = isInterval ? s.IntervalMinutes : null,
            OffsetMinutes = isInterval ? s.OffsetMinutes : null,
            ScheduleTime = isInterval ? null : s.ScheduleTime.ToString(@"hh\:mm\:ss"),
            ScheduleTimezone = isInterval ? null : s.ScheduleTimezone,
            LastRunAt = s.LastRunAt,
            LastRunStatus = s.LastRunStatus,
            LastRunMessage = s.LastRunMessage,
            TriggerEndpoint = null
        };
    }
}

public class ScheduleDiscoveryResponse
{
    [JsonPropertyName("service")]
    public string Service { get; set; } = string.Empty;

    [JsonPropertyName("schedules")]
    public List<ScheduleDiscoveryItem> Schedules { get; set; } = new();
}

public class ScheduleDiscoveryItem
{
    [JsonPropertyName("id")]
    public int? Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_enabled")]
    public bool IsEnabled { get; set; }

    [JsonPropertyName("cadence")]
    public string Cadence { get; set; } = string.Empty;

    [JsonPropertyName("cadence_type")]
    public string CadenceType { get; set; } = string.Empty;

    [JsonPropertyName("interval_minutes")]
    public int? IntervalMinutes { get; set; }

    [JsonPropertyName("offset_minutes")]
    public int? OffsetMinutes { get; set; }

    [JsonPropertyName("schedule_time")]
    public string? ScheduleTime { get; set; }

    [JsonPropertyName("schedule_timezone")]
    public string? ScheduleTimezone { get; set; }

    [JsonPropertyName("last_run_at")]
    public DateTime? LastRunAt { get; set; }

    [JsonPropertyName("last_run_status")]
    public string? LastRunStatus { get; set; }

    [JsonPropertyName("last_run_message")]
    public string? LastRunMessage { get; set; }

    [JsonPropertyName("trigger_endpoint")]
    public string? TriggerEndpoint { get; set; }
}

public class ScheduleToggleResponse
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("is_enabled")]
    public bool IsEnabled { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}
