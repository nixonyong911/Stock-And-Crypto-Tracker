using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Massive;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Massive.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Workers.Massive;

/// <summary>
/// Background service that consumes indicator fetch requests from the massive-indicator-queue.
/// Uses FIFO processing with prefetch=1 to process one indicator request at a time.
/// Supports both "daily" single-day fetches and "backfill" historical range fetches.
/// </summary>
public class MassiveQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<MassiveQueueConsumer> _logger;
    private readonly IMetricsClient _metrics;
    private IConnection? _connection;
    private IModel? _channel;
    private const string MetricsPrefix = "data_fetcher_2_massive";
    private const string RetryCountHeader = "x-retry-count";
    private const int MaxRetries = 3;
    private static readonly int[] RetryDelaysSeconds = { 30, 120, 300 };

    public MassiveQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<MassiveQueueConsumer> logger,
        IMetricsClient metrics)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MassiveQueueConsumer starting...");

        // Wait for services to initialize
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        if (stoppingToken.IsCancellationRequested)
            return;

        // Connect to RabbitMQ with retry
        var connected = await ConnectToRabbitMqAsync(stoppingToken);
        if (!connected)
        {
            _logger.LogError("Failed to connect to RabbitMQ after retries. MassiveQueueConsumer will not start");
            return;
        }

        try
        {
            InitializeQueue();
            StartConsuming(stoppingToken);

            _logger.LogInformation(
                "MassiveQueueConsumer started - listening on queue: {Queue}",
                _rabbitSettings.MassiveQueueName);

            // Keep running until cancellation
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("MassiveQueueConsumer stopping due to cancellation");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in MassiveQueueConsumer");
            throw;
        }
    }

    /// <summary>
    /// Connects to RabbitMQ with retry logic. Tries 5 times with 10 second delays.
    /// </summary>
    private async Task<bool> ConnectToRabbitMqAsync(CancellationToken ct)
    {
        var factory = new ConnectionFactory
        {
            HostName = _rabbitSettings.HostName,
            UserName = _rabbitSettings.UserName,
            Password = _rabbitSettings.Password,
            Port = _rabbitSettings.Port,
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
        };

        for (int attempt = 1; attempt <= 5; attempt++)
        {
            if (ct.IsCancellationRequested) return false;

            try
            {
                _connection = factory.CreateConnection();
                _channel = _connection.CreateModel();
                _logger.LogInformation("Connected to RabbitMQ on attempt {Attempt}", attempt);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "RabbitMQ connection attempt {Attempt}/5 failed", attempt);
                if (attempt < 5) await Task.Delay(TimeSpan.FromSeconds(10), ct);
            }
        }

        return false;
    }

    /// <summary>
    /// Declares the queue and sets prefetch for FIFO processing.
    /// </summary>
    private void InitializeQueue()
    {
        _channel!.QueueDeclare(
            queue: _rabbitSettings.MassiveQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        // CRITICAL: Set prefetch to 1 for FIFO processing - one message at a time
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);

        _logger.LogInformation(
            "RabbitMQ initialized - Queue: {Queue}, Prefetch: 1 (FIFO mode)",
            _rabbitSettings.MassiveQueueName);
    }

    /// <summary>
    /// Creates the consumer and begins consuming messages from the queue.
    /// </summary>
    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);

        consumer.Received += async (_, ea) =>
        {
            // IMPORTANT: EventingBasicConsumer.Received is EventHandler (returns void).
            // This async lambda is "async void" so ALL exceptions must be caught here
            // to prevent unhandled exceptions from crashing the process.
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);
            var requestType = "unknown";

            try
            {
                var retryCount = GetRetryCount(ea.BasicProperties);

                if (retryCount > 0)
                {
                    var backoffSeconds = RetryDelaysSeconds[Math.Min(retryCount - 1, RetryDelaysSeconds.Length - 1)];
                    _logger.LogInformation(
                        "Retry {RetryCount}/{MaxRetries} for message, backing off {Seconds}s before processing",
                        retryCount, MaxRetries, backoffSeconds);
                    await Task.Delay(TimeSpan.FromSeconds(backoffSeconds), stoppingToken);
                }

                _logger.LogInformation("Received massive indicator message: {Message}", message);

                var request = JsonSerializer.Deserialize<MassiveIndicatorRequest>(message);

                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _logger.LogWarning("Invalid indicator request received: {Message}", message);
                    _channel?.BasicAck(ea.DeliveryTag, multiple: false);
                    return;
                }

                requestType = request.Type;
                await ProcessIndicatorRequestAsync(request, stoppingToken);

                _channel?.BasicAck(ea.DeliveryTag, multiple: false);

                _logger.LogInformation(
                    "Indicator fetch completed and acknowledged for {Symbol} ({Type})",
                    request.Symbol, request.Type);

                try
                {
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_queue_messages_consumed_total", 1,
                        new Dictionary<string, string>
                        {
                            ["type"] = request.Type,
                            ["status"] = "success"
                        });
                }
                catch (Exception metricsEx)
                {
                    _logger.LogWarning(metricsEx, "Failed to record success metric (non-fatal)");
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogWarning("Indicator processing cancelled - message will be requeued");
                try { _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true); }
                catch (Exception nackEx) { _logger.LogWarning(nackEx, "Failed to nack message after cancellation"); }
            }
            catch (Exception ex)
            {
                var retryCount = GetRetryCount(ea.BasicProperties);
                _logger.LogError(ex, "Error processing indicator message (attempt {Attempt}/{MaxRetries}): {Message}",
                    retryCount + 1, MaxRetries, message);

                // ACK the original to remove it from the queue
                try { _channel?.BasicAck(ea.DeliveryTag, multiple: false); }
                catch (Exception ackEx) { _logger.LogWarning(ackEx, "Failed to ack failed message"); }

                if (retryCount < MaxRetries)
                {
                    RepublishWithRetry(body, ea.BasicProperties, retryCount + 1);
                }
                else
                {
                    _logger.LogWarning(
                        "Message permanently failed after {MaxRetries} retries, dropping: {Message}",
                        MaxRetries, message);

                    try
                    {
                        await _metrics.IncrementCounterAsync($"{MetricsPrefix}_queue_messages_dead_lettered_total", 1);
                    }
                    catch { /* non-fatal */ }
                }

                try
                {
                    await _metrics.IncrementCounterAsync($"{MetricsPrefix}_queue_messages_consumed_total", 1,
                        new Dictionary<string, string>
                        {
                            ["type"] = requestType,
                            ["status"] = "failed"
                        });
                }
                catch (Exception metricsEx)
                {
                    _logger.LogWarning(metricsEx, "Failed to record failure metric (non-fatal)");
                }
            }
        };

        _channel!.BasicConsume(
            queue: _rabbitSettings.MassiveQueueName,
            autoAck: false,
            consumer: consumer);
    }

    private static int GetRetryCount(IBasicProperties? properties)
    {
        if (properties?.Headers != null &&
            properties.Headers.TryGetValue(RetryCountHeader, out var value) &&
            value is int count)
        {
            return count;
        }
        return 0;
    }

    private void RepublishWithRetry(byte[] body, IBasicProperties? originalProperties, int retryCount)
    {
        try
        {
            var properties = _channel!.CreateBasicProperties();
            properties.Persistent = true;
            properties.ContentType = "application/json";
            properties.Headers = originalProperties?.Headers != null
                ? new Dictionary<string, object>(originalProperties.Headers)
                : new Dictionary<string, object>();
            properties.Headers[RetryCountHeader] = retryCount;

            _channel.BasicPublish(
                exchange: string.Empty,
                routingKey: _rabbitSettings.MassiveQueueName,
                basicProperties: properties,
                body: body);

            _logger.LogInformation("Re-published message to queue with retry count {RetryCount}/{MaxRetries}",
                retryCount, MaxRetries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to re-publish message for retry {RetryCount}", retryCount);
        }
    }

    /// <summary>
    /// Processes a single indicator request by resolving scoped services and dispatching
    /// to the appropriate fetch method based on request type.
    /// </summary>
    private async Task ProcessIndicatorRequestAsync(MassiveIndicatorRequest request, CancellationToken ct)
    {
        _logger.LogInformation(
            "Processing {Type} indicator request for {Symbol} (TickerId: {TickerId}, RequestedAt: {RequestedAt})",
            request.Type, request.Symbol, request.TickerId, request.RequestedAt);

        using var scope = _serviceProvider.CreateScope();
        var indicatorService = scope.ServiceProvider.GetRequiredService<IIndicatorFetchService>();
        var tickerRepo = scope.ServiceProvider.GetRequiredService<IStockTickerRepository>();

        var ticker = await tickerRepo.GetByIdAsync(request.TickerId);
        if (ticker == null)
        {
            _logger.LogWarning("Ticker not found for TickerId {TickerId} ({Symbol}). Skipping request",
                request.TickerId, request.Symbol);
            return;
        }

        switch (request.Type)
        {
            case "daily":
            {
                if (string.IsNullOrEmpty(request.TargetDate))
                {
                    _logger.LogWarning("Daily request for {Symbol} missing TargetDate. Skipping", request.Symbol);
                    return;
                }

                var targetDate = DateOnly.Parse(request.TargetDate);
                var count = await indicatorService.FetchDailyIndicatorsAsync(ticker, targetDate, ct);

                _logger.LogInformation(
                    "Daily indicator fetch for {Symbol} on {Date}: {Count} records upserted",
                    ticker.Symbol, targetDate, count);
                break;
            }

            case "backfill":
            {
                if (string.IsNullOrEmpty(request.StartDate) || string.IsNullOrEmpty(request.EndDate))
                {
                    _logger.LogWarning("Backfill request for {Symbol} missing StartDate/EndDate. Skipping", request.Symbol);
                    return;
                }

                var startDate = DateOnly.Parse(request.StartDate);
                var endDate = DateOnly.Parse(request.EndDate);

                int count;
                if (!string.IsNullOrEmpty(request.IndicatorType))
                {
                    // New per-indicator paginated backfill
                    count = await indicatorService.FetchBackfillSingleIndicatorAsync(
                        ticker, request.IndicatorType, startDate, endDate, ct);

                    _logger.LogInformation(
                        "Backfill indicator fetch for {Symbol}/{Indicator} ({Start} to {End}): {Count} records upserted",
                        ticker.Symbol, request.IndicatorType, startDate, endDate, count);
                }
                else
                {
                    // Legacy: backfill all 4 indicators in one message
                    count = await indicatorService.FetchBackfillIndicatorsAsync(ticker, startDate, endDate, ct);

                    _logger.LogInformation(
                        "Backfill indicator fetch for {Symbol} ({Start} to {End}): {Count} records upserted",
                        ticker.Symbol, startDate, endDate, count);
                }
                break;
            }

            default:
                _logger.LogWarning("Unknown request type '{Type}' for {Symbol}. Skipping", request.Type, request.Symbol);
                break;
        }
    }

    public override void Dispose()
    {
        try { _channel?.Close(); } catch { /* ignore */ }
        try { _channel?.Dispose(); } catch { /* ignore */ }
        try { _connection?.Close(); } catch { /* ignore */ }
        try { _connection?.Dispose(); } catch { /* ignore */ }

        _logger.LogInformation("MassiveQueueConsumer disposed");

        base.Dispose();
    }
}
