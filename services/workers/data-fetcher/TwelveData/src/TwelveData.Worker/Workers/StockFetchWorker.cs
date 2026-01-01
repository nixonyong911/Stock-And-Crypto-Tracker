using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StockTracker.Common.Metrics;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Workers;

public class StockFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StockFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "TwelveData";
    private const string WorkerVersion = "1.0.0";

    public StockFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<StockFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("TwelveData Stock Fetch Worker starting");

        // Report worker starting
        await ReportWorkerStartAsync();

        // Wait a bit for the database to be ready
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Update heartbeat
                    await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                        DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                    // Load schedule from database
                    using var scope = _serviceProvider.CreateScope();
                    var scheduleRepository = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                    
                    var schedule = await scheduleRepository.GetScheduleByDataSourceNameAsync(DataSourceName);
                    
                    if (schedule == null)
                    {
                        _logger.LogWarning("No enabled schedule found for data source '{DataSource}'. Retrying in 1 hour.", DataSourceName);
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
                    var config = JsonSerializer.Deserialize<FetchConfig>(schedule.FetchConfig) ?? new FetchConfig();
                    
                    // Calculate delay until next scheduled run
                    var delay = CalculateDelayUntilScheduledTime(schedule.ScheduleTimeUtc);
                    
                    _logger.LogInformation(
                        "Schedule '{ScheduleName}' loaded. Next run at {ScheduleTime} UTC (in {Hours}h {Minutes}m)", 
                        schedule.Name, 
                        schedule.ScheduleTimeUtc,
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
                    _logger.LogInformation("Starting scheduled fetch for '{ScheduleName}' at {Time} UTC", 
                        schedule.Name, DateTime.UtcNow);

                    // Record job execution start
                    await _metrics.IncrementCounterAsync("job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "started" });

                    try
                    {
                        // Create new scope for the actual fetch operation
                        using var fetchScope = _serviceProvider.CreateScope();
                        var stockFetchService = fetchScope.ServiceProvider.GetRequiredService<IStockFetchService>();
                        
                        // Reload schedule to get fresh data
                        var freshScheduleRepo = fetchScope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                        var freshSchedule = await freshScheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);
                        
                        if (freshSchedule != null && freshSchedule.IsEnabled)
                        {
                            var freshConfig = JsonSerializer.Deserialize<FetchConfig>(freshSchedule.FetchConfig) ?? new FetchConfig();
                            await stockFetchService.FetchAndStoreStockDataAsync(freshSchedule, freshConfig, stoppingToken);
                        }

                        // Record job execution success
                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
                            new Dictionary<string, string> { ["status"] = "completed" });
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        _logger.LogInformation("Stock Fetch Worker cancellation requested during fetch");
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error occurred during stock fetch operation");
                        
                        // Record job execution failure
                        await _metrics.IncrementCounterAsync("job_executions_total", 1,
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
                    _logger.LogError(ex, "Unexpected error in worker loop");
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

        _logger.LogInformation("TwelveData Stock Fetch Worker stopped");
    }

    private async Task ReportWorkerStartAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync("worker_up", 1);
            await _metrics.SetGaugeAsync("worker_info", 1,
                new Dictionary<string, string>
                {
                    ["version"] = WorkerVersion,
                    ["worker_name"] = "twelvedata"
                });
            await _metrics.SetGaugeAsync("worker_last_activity_timestamp",
                DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report worker start metrics");
        }
    }

    private async Task ReportWorkerStopAsync()
    {
        try
        {
            await _metrics.SetGaugeAsync("worker_up", 0);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to report worker stop metrics");
        }
    }

    /// <summary>
    /// Calculate delay until the next occurrence of the scheduled time
    /// </summary>
    private static TimeSpan CalculateDelayUntilScheduledTime(TimeSpan scheduleTimeUtc)
    {
        var now = DateTime.UtcNow;
        var todayScheduled = now.Date.Add(scheduleTimeUtc);
        
        // If the scheduled time has already passed today, schedule for tomorrow
        if (now >= todayScheduled)
        {
            todayScheduled = todayScheduled.AddDays(1);
        }
        
        return todayScheduled - now;
    }
}
