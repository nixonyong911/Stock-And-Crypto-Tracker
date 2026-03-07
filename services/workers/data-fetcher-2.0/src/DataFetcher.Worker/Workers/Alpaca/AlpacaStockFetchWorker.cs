using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
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
    private DateTime? _lastFetchTime;

    private static readonly TimeZoneInfo EasternTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public AlpacaStockFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaStockFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Alpaca Stock Fetch Worker starting (30-min interval, 24/5)");
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var nowEt = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz);

                // TEMP: Weekend check disabled for testing
                // if (nowEt.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
                // {
                //     var nextMonday = nowEt.Date.AddDays(nowEt.DayOfWeek == DayOfWeek.Saturday ? 2 : 1)
                //         .Add(TimeSpan.FromHours(4)); // 04:00 ET Monday
                //     var sleepUntil = TimeZoneInfo.ConvertTimeToUtc(nextMonday, EasternTz) - DateTime.UtcNow;
                //     if (sleepUntil > TimeSpan.Zero)
                //     {
                //         _logger.LogInformation("Weekend detected. Sleeping until Monday 04:00 ET ({Duration})", sleepUntil);
                //         await Task.Delay(sleepUntil, stoppingToken);
                //     }
                //     continue;
                // }

                using var scope = _serviceProvider.CreateScope();
                var fetchService = scope.ServiceProvider.GetRequiredService<IAlpacaStockFetchService>();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

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
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during stock fetch");

                    await _metrics.IncrementCounterAsync("alpaca_stock_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "error" });
                }

                // Update schedule record
                var schedule = await scheduleRepo.GetScheduleByNameAsync("Alpaca Stock Fetch");
                if (schedule != null)
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
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
