using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DataFetcher.Worker.Workers.Alpaca;

public class AlpacaBackfillQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<AlpacaBackfillQueueConsumer> _logger;
    private IConnection? _connection;
    private IModel? _channel;

    public AlpacaBackfillQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<AlpacaBackfillQueueConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AlpacaBackfillQueueConsumer starting...");
        await WaitForRabbitMQAsync(stoppingToken);

        if (stoppingToken.IsCancellationRequested) return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);

            _logger.LogInformation("AlpacaBackfillQueueConsumer listening on queue: {Queue}", _rabbitSettings.BackfillQueueName);

            while (!stoppingToken.IsCancellationRequested)
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("AlpacaBackfillQueueConsumer stopping");
        }
    }

    private async Task WaitForRabbitMQAsync(CancellationToken stoppingToken)
    {
        for (var i = 0; i < 10; i++)
        {
            if (stoppingToken.IsCancellationRequested) return;
            try
            {
                using var test = CreateConnectionFactory().CreateConnection();
                _logger.LogInformation("Connected to RabbitMQ for backfill consumer");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("RabbitMQ not ready (attempt {Attempt}/10): {Message}", i + 1, ex.Message);
                if (i < 9) await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
        throw new InvalidOperationException("Could not connect to RabbitMQ after 10 attempts");
    }

    private ConnectionFactory CreateConnectionFactory() => new()
    {
        HostName = _rabbitSettings.HostName,
        UserName = _rabbitSettings.UserName,
        Password = _rabbitSettings.Password,
        Port = _rabbitSettings.Port,
        AutomaticRecoveryEnabled = true,
        NetworkRecoveryInterval = TimeSpan.FromSeconds(10)
    };

    private void InitializeRabbitMQ()
    {
        _connection = CreateConnectionFactory().CreateConnection();
        _channel = _connection.CreateModel();
        _channel.QueueDeclare(queue: _rabbitSettings.BackfillQueueName, durable: true, exclusive: false, autoDelete: false);
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);
        consumer.Received += async (_, ea) =>
        {
            var body = Encoding.UTF8.GetString(ea.Body.ToArray());
            _logger.LogInformation("Received backfill message: {Message}", body);

            try
            {
                var request = JsonSerializer.Deserialize<AlpacaBackfillRequest>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _logger.LogWarning("Invalid backfill request: {Message}", body);
                    _channel?.BasicAck(ea.DeliveryTag, false);
                    return;
                }

                using var scope = _serviceProvider.CreateScope();
                var backfillService = scope.ServiceProvider.GetRequiredService<IAlpacaStockBackfillService>();
                var result = await backfillService.ExecuteBackfillAsync(request, stoppingToken);

                if (result.Success)
                {
                    PublishAnalysisBackfill(request.Symbol, "stock");
                    _channel?.BasicAck(ea.DeliveryTag, false);
                }
                else
                {
                    throw new InvalidOperationException($"Backfill failed: {result.Error}");
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _channel?.BasicNack(ea.DeliveryTag, false, true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing backfill message");
                _channel?.BasicNack(ea.DeliveryTag, false, true);
            }
        };

        _channel.BasicConsume(queue: _rabbitSettings.BackfillQueueName, autoAck: false, consumer: consumer);
    }

    private void PublishAnalysisBackfill(string symbol, string assetType)
    {
        try
        {
            var message = JsonSerializer.Serialize(new { Symbol = symbol, AssetType = assetType, RequestedAt = DateTime.UtcNow });
            var messageBytes = Encoding.UTF8.GetBytes(message);
            var properties = _channel!.CreateBasicProperties();
            properties.Persistent = true;

            _channel.BasicPublish(
                exchange: "",
                routingKey: _rabbitSettings.AnalysisBackfillQueueName,
                basicProperties: properties,
                body: messageBytes);

            _logger.LogInformation("Published analysis backfill for {Symbol}", symbol);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to publish analysis backfill for {Symbol} (non-fatal)", symbol);
        }
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();
        base.Dispose();
    }
}
