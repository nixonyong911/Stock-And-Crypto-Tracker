using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StockTracker.Common.Metrics;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Workers;

/// <summary>
/// Background service that fetches cryptocurrency data on a schedule.
/// Runs at 16:45 NY time (15 minutes after stock fetch at 16:30).
/// </summary>
public class CryptoFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CryptoFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    
    private const string ScheduleName = "TwelveData Daily Crypto";
    private const string WorkerVersion = "1.0.0";

    public CryptoFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<CryptoFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("TwelveData Crypto Fetch Worker starting");

        // Report worker starting
        await ReportWorkerStartAsync();

        // Wait a bit for the database to be ready
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Update heartbeat
                    await _metrics.SetGaugeAsync("crypto_worker_last_activity_timestamp",
                        DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                    // Load schedule from database
                    using var scope = _serviceProvider.CreateScope();
                    var scheduleRepository = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                    
                    var schedule = await scheduleRepository.GetScheduleByNameAsync(ScheduleName);
                    
                    if (schedule == null)
                    {
                        _logger.LogWarning("No schedule found for '{ScheduleName}'. Retrying in 1 hour.", ScheduleName);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    if (!schedule.IsEnabled)
                    {
                        _logger.LogInformation("Schedule '{ScheduleName}' is disabled. Checking again in 1 hour.", schedule.Name);
                        await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                        continue;
                    }

                    // Parse fetch config
                    var config = JsonSerializer.Deserialize<CryptoFetchConfig>(schedule.FetchConfig) ?? new CryptoFetchConfig();
                    
                    // Calculate delay until next scheduled run (timezone-aware)
                    var (delay, nextRunUtc) = CalculateDelayUntilScheduledTime(schedule.ScheduleTime, schedule.ScheduleTimezone);
                    
                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded. Next run at {ScheduleTime} {Timezone} ({NextRunUtc} UTC, in {Hours}h {Minutes}m)", 
                        schedule.Name, 
                        schedule.ScheduleTime,
                        schedule.ScheduleTimezone,
                        nextRunUtc.ToString("HH:mm"),
                        (int)delay.TotalHours,
                        delay.Minutes);

                    // Wait until scheduled time
                    try
                    {
                        await Task.Delay(delay, stoppingToken);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        break;
                    }

                    // Execute fetch
                    _logger.LogInformation("Starting scheduled crypto fetch for '{ScheduleName}' at {Time} UTC", 
                        schedule.Name, DateTime.UtcNow);

                    // Record job execution start
                    await _metrics.IncrementCounterAsync("crypto_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    try
                    {
                        // Create new scope for the actual fetch operation
                        using var fetchScope = _serviceProvider.CreateScope();
                        var cryptoFetchService = fetchScope.ServiceProvider.GetRequiredService<ICryptoFetchService>();
                        
                        // Reload schedule to get fresh data
                        var freshScheduleRepo = fetchScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                        var freshSchedule = await freshScheduleRepo.GetScheduleByNameAsync(ScheduleName);
                        
                        if (freshSchedule != null && freshSchedule.IsEnabled)
                        {
                            var freshConfig = JsonSerializer.Deserialize<CryptoFetchConfig>(freshSchedule.FetchConfig) ?? new CryptoFetchConfig();
                            await cryptoFetchService.FetchAndStoreCryptoDataAsync(freshSchedule, freshConfig, stoppingToken);
                        }

                        // Record job execution success
                        await _metrics.IncrementCounterAsync("crypto_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "completed" });
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        _logger.LogInformation("Crypto Fetch Worker cancellation requested during fetch");
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error occurred during crypto fetch operation");
                        
                        // Record job execution failure
                        await _metrics.IncrementCounterAsync("crypto_job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "failed" });
                    }

                    // Small delay before checking schedule again (to prevent tight loop on same second)
                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Unexpected error in crypto worker loop");
                    // Wait before retrying
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
        }
        finally
        {
            // Report worker stopping
            await ReportWorkerStopAsync();
        }

        _logger.LogInformation("TwelveData Crypto Fetch Worker stopped");
    }

    private async Task ReportWorkerStartAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync("crypto_worker_up", 1);
            await _metrics.SetGaugeAsync("crypto_worker_info", 1,
                new Dictionary<string, string>
                {
                    ["version"] = WorkerVersion,
                    ["worker_name"] = "twelvedata-crypto"
                });
            await _metrics.SetGaugeAsync("crypto_worker_last_activity_timestamp",
                DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report crypto worker start metrics");
        }
    }

    private async Task ReportWorkerStopAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync("crypto_worker_up", 0);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report crypto worker stop metrics");
        }
    }

    /// <summary>
    /// Calculate delay until the next occurrence of the scheduled time.
    /// Converts from the specified timezone to UTC, handling DST automatically.
    /// </summary>
    /// <param name="scheduleTime">Time of day in the target timezone</param>
    /// <param name="scheduleTimezone">IANA timezone name (e.g., "America/New_York")</param>
    /// <returns>Tuple of (delay until next run, next run time in UTC)</returns>
    private static (TimeSpan delay, DateTime nextRunUtc) CalculateDelayUntilScheduledTime(TimeSpan scheduleTime, string scheduleTimezone)
    {
        var now = DateTime.UtcNow;
        
        // Get the timezone info
        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(scheduleTimezone);
        }
        catch (TimeZoneNotFoundException)
        {
            // Fallback to UTC if timezone not found
            tz = TimeZoneInfo.Utc;
        }
        
        // Get current time in the target timezone
        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(now, tz);
        
        // Calculate today's scheduled time in target timezone
        var todayScheduledInTz = nowInTz.Date.Add(scheduleTime);
        
        // If scheduled time has passed today, schedule for tomorrow
        if (nowInTz >= todayScheduledInTz)
        {
            todayScheduledInTz = todayScheduledInTz.AddDays(1);
        }
        
        // Convert scheduled time back to UTC
        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(todayScheduledInTz, tz);
        
        // Calculate delay
        var delay = scheduledUtc - now;
        
        return (delay, scheduledUtc);
    }
}
