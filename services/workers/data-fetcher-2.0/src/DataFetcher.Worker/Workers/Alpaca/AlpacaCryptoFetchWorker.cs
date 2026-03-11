using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Alpaca;

public class AlpacaCryptoFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaCryptoFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private readonly IGatewayAlertNotifier _alertNotifier;
    private DateTime? _lastFetchTime;

    private static readonly TimeZoneInfo EasternTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public AlpacaCryptoFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaCryptoFetchWorker> logger,
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
        _logger.LogInformation("Alpaca Crypto Fetch Worker starting (30-min interval, 24/5)");
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var nowEt = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTz);

                if (nowEt.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
                {
                    var nextMonday = nowEt.Date.AddDays(nowEt.DayOfWeek == DayOfWeek.Saturday ? 2 : 1)
                        .Add(TimeSpan.FromHours(4));
                    var sleepUntil = TimeZoneInfo.ConvertTimeToUtc(nextMonday, EasternTz) - DateTime.UtcNow;
                    if (sleepUntil > TimeSpan.Zero)
                    {
                        _logger.LogInformation("Weekend detected. Crypto worker sleeping until Monday ({Duration})", sleepUntil);
                        await Task.Delay(sleepUntil, stoppingToken);
                    }
                    continue;
                }

                using var scope = _serviceProvider.CreateScope();
                var fetchService = scope.ServiceProvider.GetRequiredService<IAlpacaCryptoFetchService>();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    var records = await fetchService.FetchLatestCryptoDataAsync(_lastFetchTime, stoppingToken);
                    _lastFetchTime = DateTime.UtcNow;
                    message = $"Fetched {records} crypto records";
                    _logger.LogInformation("{Message}", message);

                    await _metrics.IncrementCounterAsync("alpaca_crypto_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "success" });

                    _ = _alertNotifier.NotifyAsync("crypto", stoppingToken);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during crypto fetch");

                    await _metrics.IncrementCounterAsync("alpaca_crypto_fetch_total", 1,
                        new Dictionary<string, string> { ["status"] = "error" });
                }

                var schedule = await scheduleRepo.GetScheduleByNameAsync("Alpaca Crypto Fetch");
                if (schedule != null)
                {
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in Alpaca Crypto Fetch Worker");
            }

            await Task.Delay(TimeSpan.FromMinutes(_settings.FetchIntervalMinutes), stoppingToken);
        }

        _logger.LogInformation("Alpaca Crypto Fetch Worker stopped");
    }
}
