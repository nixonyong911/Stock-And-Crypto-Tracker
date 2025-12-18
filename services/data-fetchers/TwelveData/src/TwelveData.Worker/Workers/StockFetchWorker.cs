using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Workers;

public class StockFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StockFetchWorker> _logger;
    private const string DataSourceName = "TwelveData";

    public StockFetchWorker(
        IServiceProvider serviceProvider,
        ILogger<StockFetchWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("TwelveData Stock Fetch Worker starting");

        // Wait a bit for the database to be ready
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
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
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    _logger.LogInformation("Stock Fetch Worker cancellation requested during fetch");
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during stock fetch operation");
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

        _logger.LogInformation("TwelveData Stock Fetch Worker stopped");
    }

    /// <summary>
    /// Calculate delay until the next occurrence of the scheduled time
    /// </summary>
    private static TimeSpan CalculateDelayUntilScheduledTime(TimeOnly scheduleTimeUtc)
    {
        var now = DateTime.UtcNow;
        var todayScheduled = now.Date.Add(scheduleTimeUtc.ToTimeSpan());
        
        // If the scheduled time has already passed today, schedule for tomorrow
        if (now >= todayScheduled)
        {
            todayScheduled = todayScheduled.AddDays(1);
        }
        
        return todayScheduled - now;
    }
}
