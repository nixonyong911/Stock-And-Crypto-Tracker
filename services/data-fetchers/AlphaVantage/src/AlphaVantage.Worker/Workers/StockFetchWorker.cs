using AlphaVantage.Worker.Configuration;
using AlphaVantage.Worker.Services;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;
using StockTracker.Common.Services;

namespace AlphaVantage.Worker.Workers;

public class StockFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly WorkerStateService _workerState;
    private readonly IMetricsClient _metricsClient;
    private readonly AlphaVantageSettings _settings;
    private readonly ILogger<StockFetchWorker> _logger;

    public StockFetchWorker(
        IServiceProvider serviceProvider,
        WorkerStateService workerState,
        IMetricsClient metricsClient,
        IOptions<AlphaVantageSettings> settings,
        ILogger<StockFetchWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _workerState = workerState;
        _metricsClient = metricsClient;
        _settings = settings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Stock Fetch Worker starting. Interval: {Interval} minutes", 
            _settings.FetchIntervalMinutes);

        _workerState.SetRunning(true);
        await _metricsClient.SetWorkerStatusAsync(isRunning: true, isPaused: false);

        // Wait a bit for the database and metrics service to be ready
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            // Check for manual trigger
            var wasTriggered = _workerState.ConsumeTrigger();
            
            // Skip if paused (unless manually triggered)
            if (_workerState.IsPaused && !wasTriggered)
            {
                await _metricsClient.SetWorkerStatusAsync(isRunning: true, isPaused: true);
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                continue;
            }

            await _metricsClient.SetWorkerStatusAsync(isRunning: true, isPaused: false);
            _logger.LogInformation("Stock Fetch Worker running at: {Time}{Trigger}", 
                DateTimeOffset.Now,
                wasTriggered ? " (manually triggered)" : "");

            try
            {
                using var scope = _serviceProvider.CreateScope();
                var stockFetchService = scope.ServiceProvider.GetRequiredService<IStockFetchService>();
                
                await stockFetchService.FetchAndStoreStockDataAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Stock Fetch Worker cancellation requested");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during stock fetch operation");
            }

            // Calculate and set next fetch time
            var nextFetch = DateTime.UtcNow.AddMinutes(_settings.FetchIntervalMinutes);
            _workerState.SetNextOperationTime(nextFetch);
            
            _logger.LogInformation("Next fetch scheduled at {NextFetch} (in {Interval} minutes)", 
                nextFetch, _settings.FetchIntervalMinutes);
            
            try
            {
                // Wait for interval, but check for triggers every 5 seconds
                var waitUntil = DateTime.UtcNow.AddMinutes(_settings.FetchIntervalMinutes);
                while (DateTime.UtcNow < waitUntil && !stoppingToken.IsCancellationRequested)
                {
                    // Check if manual trigger requested
                    if (_workerState.TriggerRequested)
                    {
                        _logger.LogInformation("Manual trigger detected, interrupting wait");
                        break;
                    }
                    
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _workerState.SetRunning(false);
        await _metricsClient.SetWorkerStatusAsync(isRunning: false, isPaused: false);
        _logger.LogInformation("Stock Fetch Worker stopped");
    }
}
