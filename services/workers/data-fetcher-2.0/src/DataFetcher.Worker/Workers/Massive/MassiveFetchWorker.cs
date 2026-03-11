using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Massive.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using StockTracker.Common.Metrics;

// ReSharper disable once RedundantUsingDirective
using DataFetcher.Worker.Domain.Common.Entities;

namespace DataFetcher.Worker.Workers.Massive;

/// <summary>
/// Background worker that runs on a schedule and publishes daily indicator fetch requests
/// to the massive-indicator-queue in RabbitMQ. Each active ticker gets a message for
/// yesterday's date, enabling parallel/sequential processing by MassiveQueueConsumer.
/// </summary>
public class MassiveFetchWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<MassiveFetchWorker> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "Massive";
    private const string WorkerVersion = "2.0.0";
    private const string MetricsPrefix = "data_fetcher_2_massive";

    public MassiveFetchWorker(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<MassiveFetchWorker> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Massive Fetch Worker starting (data-fetcher-2.0)");
        await ReportWorkerStartAsync();

        // Wait for other services to initialize
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_last_activity_timestamp",
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds());

                using var scope = _serviceProvider.CreateScope();
                var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();
                var tickerRepo = scope.ServiceProvider.GetRequiredService<IStockTickerRepository>();

                // Get schedule from database
                var schedule = await scheduleRepo.GetScheduleByDataSourceNameAsync(DataSourceName);

                if (schedule == null || !schedule.IsEnabled)
                {
                    _logger.LogWarning("No enabled schedule found for {DataSource}, waiting 1 hour", DataSourceName);
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                    continue;
                }

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

                await Task.Delay(delay, stoppingToken);

                if (stoppingToken.IsCancellationRequested) break;

                // Execute the work - publish messages to queue
                var startedAt = DateTime.UtcNow;
                var status = "success";
                string? message = null;

                try
                {
                    _logger.LogInformation("Starting scheduled Massive indicator fetch - publishing to queue");

                    var tickers = await tickerRepo.GetActiveTickersAsync();
                    var tickerList = tickers.ToList();
                    var yesterday = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));

                    _logger.LogInformation(
                        "Publishing {Count} daily stock indicator requests for {Date}",
                        tickerList.Count, yesterday);

                    var requests = tickerList.Select(ticker => new MassiveIndicatorRequest
                    {
                        Type = "daily",
                        Symbol = ticker.Symbol,
                        TickerId = ticker.Id,
                        AssetType = "stock",
                        TargetDate = yesterday.ToString("yyyy-MM-dd"),
                        RequestedAt = DateTime.UtcNow
                    }).ToList();

                    PublishBatchToQueue(requests);

                    // Wait 30 minutes before publishing crypto requests (rate limit buffer)
                    var cryptoTickerRepo = scope.ServiceProvider.GetRequiredService<ICryptoTickerRepository>();
                    var cryptoTickers = (await cryptoTickerRepo.GetActiveTickersAsync()).ToList();

                    if (cryptoTickers.Count > 0)
                    {
                        _logger.LogInformation(
                            "Stock requests published. Waiting 30 minutes before publishing {Count} crypto indicator requests",
                            cryptoTickers.Count);

                        await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);

                        var cryptoRequests = cryptoTickers.Select(ticker => new MassiveIndicatorRequest
                        {
                            Type = "daily",
                            Symbol = ticker.Symbol,
                            TickerId = ticker.Id,
                            AssetType = "crypto",
                            TargetDate = yesterday.ToString("yyyy-MM-dd"),
                            RequestedAt = DateTime.UtcNow
                        }).ToList();

                        PublishBatchToQueue(cryptoRequests);

                        message = $"Published {requests.Count} stock + {cryptoRequests.Count} crypto indicator requests for {yesterday:yyyy-MM-dd}";
                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_queue_messages_published_total", cryptoRequests.Count,
                            new Dictionary<string, string> { ["asset_type"] = "crypto" });
                    }
                    else
                    {
                        message = $"Published {requests.Count} stock indicator requests for {yesterday:yyyy-MM-dd} (no active crypto tickers)";
                    }

                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "completed" });
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_queue_messages_published_total", requests.Count,
                        new Dictionary<string, string> { ["asset_type"] = "stock" });

                    _logger.LogInformation("Completed scheduled publish: {Message}", message);
                }
                catch (Exception ex)
                {
                    status = "failed";
                    message = ex.Message;
                    _logger.LogError(ex, "Error during scheduled Massive indicator publish");
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_job_executions_total", 1,
                        new Dictionary<string, string> { ["status"] = "failed" });
                }
                finally
                {
                    // Update last run with status and message
                    await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                    await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, (int)(DateTime.UtcNow - startedAt).TotalMilliseconds, startedAt);
                }
            }
        }
        finally
        {
            await ReportWorkerStopAsync();
            _logger.LogInformation("Massive Fetch Worker stopped");
        }
    }

    /// <summary>
    /// Publishes a batch of indicator requests to RabbitMQ using a single connection.
    /// </summary>
    private void PublishBatchToQueue(List<MassiveIndicatorRequest> requests)
    {
        using var connection = CreateConnectionFactory().CreateConnection();
        using var channel = connection.CreateModel();

        channel.QueueDeclare(
            queue: _rabbitSettings.MassiveQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        foreach (var request in requests)
        {
            var messageBody = JsonSerializer.Serialize(request);
            var body = Encoding.UTF8.GetBytes(messageBody);

            var properties = channel.CreateBasicProperties();
            properties.Persistent = true;
            properties.ContentType = "application/json";

            channel.BasicPublish(
                exchange: string.Empty,
                routingKey: _rabbitSettings.MassiveQueueName,
                basicProperties: properties,
                body: body);
        }

        _logger.LogInformation("Published {Count} messages to {Queue}", requests.Count, _rabbitSettings.MassiveQueueName);
    }

    private ConnectionFactory CreateConnectionFactory()
    {
        return new ConnectionFactory
        {
            HostName = _rabbitSettings.HostName,
            UserName = _rabbitSettings.UserName,
            Password = _rabbitSettings.Password,
            Port = _rabbitSettings.Port,
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
        };
    }

    /// <summary>
    /// Calculates the delay until the next scheduled run time, accounting for timezone.
    /// </summary>
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
        if (todayScheduledInTz <= nowInTz)
        {
            todayScheduledInTz = todayScheduledInTz.AddDays(1);
        }

        // Convert scheduled time back to UTC
        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(todayScheduledInTz, tz);

        // Calculate delay
        var delay = scheduledUtc - now;

        return (delay, scheduledUtc);
    }

    private async Task ReportWorkerStartAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 1);
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_info", 1,
            new Dictionary<string, string>
            {
                ["version"] = WorkerVersion,
                ["worker_name"] = "massive",
                ["service"] = "data-fetcher-2.0"
            });
    }

    private async Task ReportWorkerStopAsync()
    {
        await _metrics.SetGaugeAsync($"{MetricsPrefix}_worker_up", 0);
    }
}
