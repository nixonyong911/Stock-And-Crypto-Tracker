using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Services;

namespace TwelveData.Worker.Workers;

/// <summary>
/// Background service that consumes crypto backfill requests from RabbitMQ queue.
/// Uses FIFO processing with prefetch=1 to ensure only one API request at a time.
/// </summary>
public class CryptoBackfillQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<CryptoBackfillQueueConsumer> _logger;

    private IConnection? _connection;
    private IModel? _channel;

    public CryptoBackfillQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<CryptoBackfillQueueConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CryptoBackfillQueueConsumer starting...");

        // Wait for RabbitMQ to be ready (with retry)
        await WaitForRabbitMQAsync(stoppingToken);

        if (stoppingToken.IsCancellationRequested)
            return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);

            _logger.LogInformation(
                "CryptoBackfillQueueConsumer started - listening on queue: {Queue}",
                _rabbitSettings.CryptoQueueName);

            // Keep running until cancellation
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("CryptoBackfillQueueConsumer stopping due to cancellation");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in CryptoBackfillQueueConsumer");
            throw;
        }
    }

    private async Task WaitForRabbitMQAsync(CancellationToken stoppingToken)
    {
        var maxRetries = 10;
        var retryDelay = TimeSpan.FromSeconds(5);

        for (var i = 0; i < maxRetries; i++)
        {
            if (stoppingToken.IsCancellationRequested)
                return;

            try
            {
                var factory = CreateConnectionFactory();
                using var testConnection = factory.CreateConnection();
                _logger.LogInformation("CryptoBackfillQueueConsumer: Successfully connected to RabbitMQ");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "RabbitMQ not ready for crypto consumer (attempt {Attempt}/{MaxRetries}): {Message}",
                    i + 1, maxRetries, ex.Message);

                if (i < maxRetries - 1)
                {
                    await Task.Delay(retryDelay, stoppingToken);
                }
            }
        }

        _logger.LogError("CryptoBackfillQueueConsumer: Failed to connect to RabbitMQ after {MaxRetries} attempts", maxRetries);
        throw new InvalidOperationException($"Could not connect to RabbitMQ after {maxRetries} attempts");
    }

    private ConnectionFactory CreateConnectionFactory()
    {
        return new ConnectionFactory
        {
            HostName = _rabbitSettings.HostName,
            UserName = _rabbitSettings.UserName,
            Password = _rabbitSettings.Password,
            Port = _rabbitSettings.Port,
            // Enable automatic recovery
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
        };
    }

    private void InitializeRabbitMQ()
    {
        var factory = CreateConnectionFactory();

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        // Declare the crypto queue (creates if not exists)
        _channel.QueueDeclare(
            queue: _rabbitSettings.CryptoQueueName,
            durable: true,      // Survive broker restart
            exclusive: false,   // Allow multiple connections
            autoDelete: false,  // Don't delete when consumer disconnects
            arguments: null);

        // CRITICAL: Set prefetch to 1 for FIFO processing
        // This ensures only one message is processed at a time
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);

        _logger.LogInformation(
            "RabbitMQ initialized for crypto - Queue: {Queue}, Prefetch: 1 (FIFO mode)",
            _rabbitSettings.CryptoQueueName);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);

        consumer.Received += async (model, ea) =>
        {
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);

            _logger.LogInformation("Received crypto backfill message: {Message}", message);

            try
            {
                var request = JsonSerializer.Deserialize<CryptoBackfillRequest>(message);

                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _logger.LogWarning("Invalid crypto backfill request received: {Message}", message);
                    // Acknowledge invalid messages to remove from queue
                    _channel?.BasicAck(ea.DeliveryTag, multiple: false);
                    return;
                }

                // Process the crypto backfill request
                await ProcessCryptoBackfillRequestAsync(request, stoppingToken);

                // Acknowledge successful processing
                _channel?.BasicAck(ea.DeliveryTag, multiple: false);

                _logger.LogInformation(
                    "Crypto backfill completed and acknowledged for {Symbol}",
                    request.Symbol);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Don't acknowledge - let the message be requeued
                _logger.LogWarning("Crypto backfill processing cancelled - message will be requeued");
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing crypto backfill message: {Message}", message);

                // Negative acknowledge - requeue for retry
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
        };

        _channel.BasicConsume(
            queue: _rabbitSettings.CryptoQueueName,
            autoAck: false,  // Manual acknowledgment for reliability
            consumer: consumer);
    }

    private async Task ProcessCryptoBackfillRequestAsync(CryptoBackfillRequest request, CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Processing crypto backfill for {Symbol} (requested at: {RequestedAt})",
            request.Symbol, request.RequestedAt);

        // Create a scope to resolve scoped services
        using var scope = _serviceProvider.CreateScope();
        var backfillService = scope.ServiceProvider.GetRequiredService<ICryptoBackfillService>();

        var result = await backfillService.ExecuteBackfillAsync(request, stoppingToken);

        if (result.Success)
        {
            _logger.LogInformation(
                "Crypto backfill successful for {Symbol}: {Records} records in {Batches} batches ({Duration:F1}s)",
                result.Symbol, result.TotalRecordsInserted, result.BatchesProcessed, result.Duration.TotalSeconds);

            // Chain candlestick analysis backfill
            await TriggerCryptoAnalysisBackfillAsync(request);

            // Chain Massive indicator backfill
            await TriggerCryptoIndicatorBackfillAsync(request);

            // Chain price target backfill
            await TriggerCryptoPriceTargetBackfillAsync(request);
        }
        else
        {
            _logger.LogError(
                "Crypto backfill failed for {Symbol}: {Error}",
                result.Symbol, result.Error);

            // Throw to trigger message requeue
            throw new InvalidOperationException($"Crypto backfill failed for {request.Symbol}: {result.Error}");
        }
    }

    private const string AnalysisBackfillQueueName = "analysis-backfill-queue";

    /// <summary>
    /// Publishes to analysis-backfill-queue with asset_type=crypto to trigger candlestick analysis.
    /// </summary>
    private Task TriggerCryptoAnalysisBackfillAsync(CryptoBackfillRequest priceBackfillRequest)
    {
        try
        {
            var analysisRequest = new
            {
                symbol = priceBackfillRequest.Symbol,
                ticker_id = priceBackfillRequest.TickerId,
                asset_type = "crypto",
                requested_at = DateTime.UtcNow
            };

            var message = JsonSerializer.Serialize(analysisRequest);
            var body = Encoding.UTF8.GetBytes(message);

            _channel?.QueueDeclare(
                queue: AnalysisBackfillQueueName,
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: null);

            var properties = _channel?.CreateBasicProperties();
            if (properties != null)
            {
                properties.Persistent = true;
                properties.ContentType = "application/json";
            }

            _channel?.BasicPublish(
                exchange: string.Empty,
                routingKey: AnalysisBackfillQueueName,
                basicProperties: properties,
                body: body);

            _logger.LogInformation(
                "Triggered crypto analysis backfill for {Symbol} - published to {Queue}",
                priceBackfillRequest.Symbol, AnalysisBackfillQueueName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to trigger crypto analysis backfill for {Symbol} (non-fatal, can be triggered manually)",
                priceBackfillRequest.Symbol);
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// HTTP-calls the data-fetcher-2.0 crypto backfill endpoint to trigger Massive indicator backfill.
    /// </summary>
    private async Task TriggerCryptoIndicatorBackfillAsync(CryptoBackfillRequest priceBackfillRequest)
    {
        try
        {
            var url = $"http://data-fetcher-2.0:8080/api/data-fetcher-2.0/api/massive/indicators/crypto/backfill/{priceBackfillRequest.Symbol}?days=90";

            using var httpClient = new HttpClient();
            var response = await httpClient.PostAsync(url, null);

            _logger.LogInformation(
                "Triggered crypto indicator backfill for {Symbol}: {StatusCode}",
                priceBackfillRequest.Symbol, response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to trigger crypto indicator backfill for {Symbol} (non-fatal, can be triggered manually)",
                priceBackfillRequest.Symbol);
        }
    }

    private async Task TriggerCryptoPriceTargetBackfillAsync(CryptoBackfillRequest priceBackfillRequest)
    {
        try
        {
            var url = $"http://data-fetcher-2.0:8080/api/price-targets/crypto/backfill/{priceBackfillRequest.Symbol}?days=90";

            using var httpClient = new HttpClient();
            var response = await httpClient.PostAsync(url, null);

            _logger.LogInformation(
                "Triggered crypto price target backfill for {Symbol}: {StatusCode}",
                priceBackfillRequest.Symbol, response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to trigger crypto price target backfill for {Symbol} (non-fatal, can be triggered manually)",
                priceBackfillRequest.Symbol);
        }
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();

        _logger.LogInformation("CryptoBackfillQueueConsumer disposed");

        base.Dispose();
    }
}
