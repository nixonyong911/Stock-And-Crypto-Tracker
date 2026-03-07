using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DataFetcher.Worker.Workers.Alpaca;

public class AlpacaCryptoBackfillQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<AlpacaCryptoBackfillQueueConsumer> _logger;
    private IConnection? _connection;
    private IModel? _channel;

    public AlpacaCryptoBackfillQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<AlpacaCryptoBackfillQueueConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AlpacaCryptoBackfillQueueConsumer starting...");
        await WaitForRabbitMQAsync(stoppingToken);

        if (stoppingToken.IsCancellationRequested) return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);

            _logger.LogInformation("AlpacaCryptoBackfillQueueConsumer listening on: {Queue}", _rabbitSettings.CryptoBackfillQueueName);

            while (!stoppingToken.IsCancellationRequested)
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("AlpacaCryptoBackfillQueueConsumer stopping");
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
                return;
            }
            catch
            {
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
        _channel.QueueDeclare(queue: _rabbitSettings.CryptoBackfillQueueName, durable: true, exclusive: false, autoDelete: false);
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);
        consumer.Received += async (_, ea) =>
        {
            var body = Encoding.UTF8.GetString(ea.Body.ToArray());
            _logger.LogInformation("Received crypto backfill message: {Message}", body);

            try
            {
                var request = JsonSerializer.Deserialize<AlpacaBackfillRequest>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _channel?.BasicAck(ea.DeliveryTag, false);
                    return;
                }

                using var scope = _serviceProvider.CreateScope();
                var backfillService = scope.ServiceProvider.GetRequiredService<IAlpacaCryptoBackfillService>();
                var result = await backfillService.ExecuteBackfillAsync(request, stoppingToken);

                if (result.Success)
                {
                    PublishAnalysisBackfill(request.Symbol);
                    _channel?.BasicAck(ea.DeliveryTag, false);
                }
                else
                {
                    throw new InvalidOperationException($"Crypto backfill failed: {result.Error}");
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _channel?.BasicNack(ea.DeliveryTag, false, true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing crypto backfill message");
                _channel?.BasicNack(ea.DeliveryTag, false, true);
            }
        };

        _channel.BasicConsume(queue: _rabbitSettings.CryptoBackfillQueueName, autoAck: false, consumer: consumer);
    }

    private void PublishAnalysisBackfill(string symbol)
    {
        try
        {
            var message = JsonSerializer.Serialize(new { Symbol = symbol, AssetType = "crypto", RequestedAt = DateTime.UtcNow });
            var properties = _channel!.CreateBasicProperties();
            properties.Persistent = true;
            _channel.BasicPublish("", _rabbitSettings.AnalysisBackfillQueueName, properties, Encoding.UTF8.GetBytes(message));
            _logger.LogInformation("Published crypto analysis backfill for {Symbol}", symbol);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to publish crypto analysis backfill for {Symbol}", symbol);
        }
    }

    public override void Dispose()
    {
        _channel?.Close(); _channel?.Dispose();
        _connection?.Close(); _connection?.Dispose();
        base.Dispose();
    }
}
