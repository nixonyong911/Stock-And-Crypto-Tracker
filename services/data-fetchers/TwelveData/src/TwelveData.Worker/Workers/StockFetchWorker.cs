using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Workers;

public class StockFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly TwelveDataSettings _settings;
    private readonly ILogger<StockFetchWorker> _logger;

    public StockFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<TwelveDataSettings> settings,
        ILogger<StockFetchWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("TwelveData Stock Fetch Worker starting. Interval: {Interval} minutes", 
            _settings.FetchIntervalMinutes);

        // Wait a bit for the database to be ready
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Stock Fetch Worker running at: {Time}", DateTimeOffset.Now);

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

            // Calculate next fetch time
            var nextFetch = DateTime.UtcNow.AddMinutes(_settings.FetchIntervalMinutes);
            _logger.LogInformation("Next fetch scheduled at {NextFetch} UTC (in {Interval} minutes)", 
                nextFetch, _settings.FetchIntervalMinutes);

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation("TwelveData Stock Fetch Worker stopped");
    }
}

