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
/// Background service that consumes ticker add requests from RabbitMQ queue.
/// Processes requests that were queued due to daily rate limit being reached.
/// </summary>
public class TickerAddQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<TickerAddQueueConsumer> _logger;
    
    private IConnection? _connection;
    private IModel? _channel;
    
    private const string QueueName = "ticker-add-queue";

    public TickerAddQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<TickerAddQueueConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("TickerAddQueueConsumer starting...");
        
        // Wait for RabbitMQ to be ready
        await WaitForRabbitMQAsync(stoppingToken);
        
        if (stoppingToken.IsCancellationRequested)
            return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);
            
            _logger.LogInformation(
                "TickerAddQueueConsumer started - listening on queue: {Queue}",
                QueueName);

            // Keep running until cancellation
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("TickerAddQueueConsumer stopping due to cancellation");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in TickerAddQueueConsumer");
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
                _logger.LogInformation("TickerAddQueueConsumer connected to RabbitMQ");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "RabbitMQ not ready for TickerAddQueueConsumer (attempt {Attempt}/{MaxRetries}): {Message}",
                    i + 1, maxRetries, ex.Message);
                
                if (i < maxRetries - 1)
                {
                    await Task.Delay(retryDelay, stoppingToken);
                }
            }
        }

        _logger.LogError("TickerAddQueueConsumer failed to connect to RabbitMQ after {MaxRetries} attempts", maxRetries);
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
            AutomaticRecoveryEnabled = true,
            NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
        };
    }

    private void InitializeRabbitMQ()
    {
        var factory = CreateConnectionFactory();
        
        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        _channel.QueueDeclare(
            queue: QueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        // Process one at a time to respect rate limits
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);

        _logger.LogInformation(
            "TickerAddQueueConsumer initialized - Queue: {Queue}, Prefetch: 1",
            QueueName);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);
        
        consumer.Received += async (model, ea) =>
        {
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);
            
            _logger.LogInformation("Received ticker add message: {Message}", message);

            try
            {
                var request = JsonSerializer.Deserialize<QueuedTickerRequest>(message);
                
                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _logger.LogWarning("Invalid ticker add request received: {Message}", message);
                    _channel?.BasicAck(ea.DeliveryTag, multiple: false);
                    return;
                }

                // Process the ticker add request
                await ProcessTickerAddRequestAsync(request, stoppingToken);

                // Acknowledge successful processing
                _channel?.BasicAck(ea.DeliveryTag, multiple: false);
                
                _logger.LogInformation(
                    "Ticker add completed and acknowledged for {Symbol}",
                    request.Symbol);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogWarning("Ticker add processing cancelled - message will be requeued");
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing ticker add message: {Message}", message);
                
                // Requeue for retry
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
        };

        _channel.BasicConsume(
            queue: QueueName,
            autoAck: false,
            consumer: consumer);
    }

    private async Task ProcessTickerAddRequestAsync(QueuedTickerRequest request, CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Processing queued ticker add for {Symbol} ({AssetType}) - queued at: {QueuedAt}",
            request.Symbol, request.AssetType, request.QueuedAt);

        using var scope = _serviceProvider.CreateScope();
        var tickerService = scope.ServiceProvider.GetRequiredService<ITickerManagementService>();

        // Parse asset type from string
        if (!Enum.TryParse<AssetType>(request.AssetType, true, out var assetType))
        {
            _logger.LogWarning("Invalid asset type in queued request: {AssetType}", request.AssetType);
            return;
        }

        var addRequest = new AddTickerRequest
        {
            Symbol = request.Symbol,
            AssetType = assetType
        };

        var result = await tickerService.AddTickerAsync(addRequest, stoppingToken);

        if (result.Success)
        {
            _logger.LogInformation(
                "Queued ticker add successful for {Symbol}: {Message}",
                request.Symbol, result.Message);
        }
        else if (result.ErrorCode == "QUEUED")
        {
            // Still rate limited - this will be requeued by the nack
            _logger.LogWarning(
                "Queued ticker add still rate limited for {Symbol} - will retry",
                request.Symbol);
            throw new InvalidOperationException("Rate limit still active");
        }
        else
        {
            _logger.LogWarning(
                "Queued ticker add failed for {Symbol}: {Error}",
                request.Symbol, result.Message);
        }
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();
        
        _logger.LogInformation("TickerAddQueueConsumer disposed");
        
        base.Dispose();
    }

    private record QueuedTickerRequest
    {
        public string Symbol { get; init; } = string.Empty;
        public string AssetType { get; init; } = string.Empty;
        public DateTime QueuedAt { get; init; }
    }
}
