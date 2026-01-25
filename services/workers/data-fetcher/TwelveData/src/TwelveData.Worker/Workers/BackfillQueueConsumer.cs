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
/// Background service that consumes backfill requests from RabbitMQ queue
/// Uses FIFO processing with prefetch=1 to ensure only one API request at a time
/// After successful price data backfill, triggers analysis backfill on the Analysis worker.
/// </summary>
public class BackfillQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<BackfillQueueConsumer> _logger;

    private IConnection? _connection;
    private IModel? _channel;

    // Queue name for triggering analysis backfill after price data is loaded
    private const string AnalysisBackfillQueueName = "analysis-backfill-queue";

    public BackfillQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<BackfillQueueConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackfillQueueConsumer starting...");

        // Wait for RabbitMQ to be ready (with retry)
        await WaitForRabbitMQAsync(stoppingToken);

        if (stoppingToken.IsCancellationRequested)
            return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);

            _logger.LogInformation(
                "BackfillQueueConsumer started - listening on queue: {Queue}",
                _rabbitSettings.QueueName);

            // Keep running until cancellation
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("BackfillQueueConsumer stopping due to cancellation");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in BackfillQueueConsumer");
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
                _logger.LogInformation("Successfully connected to RabbitMQ");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "RabbitMQ not ready (attempt {Attempt}/{MaxRetries}): {Message}",
                    i + 1, maxRetries, ex.Message);

                if (i < maxRetries - 1)
                {
                    await Task.Delay(retryDelay, stoppingToken);
                }
            }
        }

        _logger.LogError("Failed to connect to RabbitMQ after {MaxRetries} attempts", maxRetries);
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

        // Declare the queue (creates if not exists)
        _channel.QueueDeclare(
            queue: _rabbitSettings.QueueName,
            durable: true,      // Survive broker restart
            exclusive: false,   // Allow multiple connections
            autoDelete: false,  // Don't delete when consumer disconnects
            arguments: null);

        // CRITICAL: Set prefetch to 1 for FIFO processing
        // This ensures only one message is processed at a time
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);

        _logger.LogInformation(
            "RabbitMQ initialized - Queue: {Queue}, Prefetch: 1 (FIFO mode)",
            _rabbitSettings.QueueName);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);

        consumer.Received += async (model, ea) =>
        {
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);

            _logger.LogInformation("Received backfill message: {Message}", message);

            try
            {
                var request = JsonSerializer.Deserialize<BackfillRequest>(message);

                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _logger.LogWarning("Invalid backfill request received: {Message}", message);
                    // Acknowledge invalid messages to remove from queue
                    _channel?.BasicAck(ea.DeliveryTag, multiple: false);
                    return;
                }

                // Process the backfill request
                await ProcessBackfillRequestAsync(request, stoppingToken);

                // Acknowledge successful processing
                _channel?.BasicAck(ea.DeliveryTag, multiple: false);

                _logger.LogInformation(
                    "Backfill completed and acknowledged for {Symbol}",
                    request.Symbol);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Don't acknowledge - let the message be requeued
                _logger.LogWarning("Backfill processing cancelled - message will be requeued");
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing backfill message: {Message}", message);

                // Negative acknowledge - requeue for retry
                // In production, you might want to implement dead-letter queue for repeated failures
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
        };

        _channel.BasicConsume(
            queue: _rabbitSettings.QueueName,
            autoAck: false,  // Manual acknowledgment for reliability
            consumer: consumer);
    }

    private async Task ProcessBackfillRequestAsync(BackfillRequest request, CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Processing backfill for {Symbol} (requested at: {RequestedAt})",
            request.Symbol, request.RequestedAt);

        // Create a scope to resolve scoped services
        using var scope = _serviceProvider.CreateScope();
        var backfillService = scope.ServiceProvider.GetRequiredService<IHistoricalBackfillService>();

        var result = await backfillService.ExecuteBackfillAsync(request, stoppingToken);

        if (result.Success)
        {
            _logger.LogInformation(
                "Backfill successful for {Symbol}: {Records} records in {Batches} batches ({Duration:F1}s)",
                result.Symbol, result.TotalRecordsInserted, result.BatchesProcessed, result.Duration.TotalSeconds);

            // Trigger analysis backfill for the newly backfilled ticker
            await TriggerAnalysisBackfillAsync(request);
        }
        else
        {
            _logger.LogError(
                "Backfill failed for {Symbol}: {Error}",
                result.Symbol, result.Error);

            // Throw to trigger message requeue
            throw new InvalidOperationException($"Backfill failed for {request.Symbol}: {result.Error}");
        }
    }

    /// <summary>
    /// Publishes a message to the analysis-backfill-queue to trigger candlestick pattern analysis
    /// for the ticker that just had its price data backfilled.
    /// </summary>
    private Task TriggerAnalysisBackfillAsync(BackfillRequest priceBackfillRequest)
    {
        try
        {
            // Create analysis backfill request message
            var analysisRequest = new
            {
                symbol = priceBackfillRequest.Symbol,
                ticker_id = priceBackfillRequest.TickerId,
                requested_at = DateTime.UtcNow
            };

            var message = JsonSerializer.Serialize(analysisRequest);
            var body = Encoding.UTF8.GetBytes(message);

            // Declare the analysis backfill queue (creates if not exists)
            _channel?.QueueDeclare(
                queue: AnalysisBackfillQueueName,
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: null);

            // Publish with persistent delivery mode
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
                "Triggered analysis backfill for {Symbol} - published to {Queue}",
                priceBackfillRequest.Symbol, AnalysisBackfillQueueName);
        }
        catch (Exception ex)
        {
            // Log but don't fail - price backfill was successful, analysis can be triggered manually
            _logger.LogError(ex,
                "Failed to trigger analysis backfill for {Symbol} - analysis can be triggered manually",
                priceBackfillRequest.Symbol);
        }

        return Task.CompletedTask;
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();

        _logger.LogInformation("BackfillQueueConsumer disposed");

        base.Dispose();
    }
}
