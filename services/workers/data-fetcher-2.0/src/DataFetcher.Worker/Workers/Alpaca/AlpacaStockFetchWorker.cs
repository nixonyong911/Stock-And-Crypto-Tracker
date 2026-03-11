using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Alpaca;

public class AlpacaStockFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaStockFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IGatewayAlertNotifier _alertNotifier;
    private DateTime? _lastFetchTime;

    public AlpacaStockFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaStockFetchWorker> logger,
        IMetricsClient metrics,
        IGatewayAlertNotifier alertNotifier)
    {
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
        _alertNotifier = alertNotifier;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Alpaca Stock Fetch Worker starting (30-min interval, 24/7 — Alpaca returns empty on non-trading days)");
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var fetchService = scope.ServiceProvider.GetRequiredService<IAlpacaStockFetchService>();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    var records = await fetchService.FetchLatestStockDataAsync(_lastFetchTime, stoppingToken);
                    _lastFetchTime = DateTime.UtcNow;
                    message = $"Fetched {records} stock records";
                    _logger.LogInformation("{Message}", message);

                    await _metrics.IncrementCounterAsync("alpaca_stock_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "success" });

                    _ = _alertNotifier.NotifyAsync("stock", stoppingToken);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during stock fetch");

                    await _metrics.IncrementCounterAsync("alpaca_stock_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "error" });
                }

                var schedule = await scheduleRepo.GetScheduleByNameAsync("Alpaca Stock Fetch");
                if (schedule != null)
                {
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in Alpaca Stock Fetch Worker");
            }

            await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
        }

        _logger.LogInformation("Alpaca Stock Fetch Worker stopped");
    }
}
