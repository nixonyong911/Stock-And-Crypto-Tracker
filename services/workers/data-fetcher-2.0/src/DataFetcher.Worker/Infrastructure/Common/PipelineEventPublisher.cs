using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Configuration;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace DataFetcher.Worker.Infrastructure.Common;

public class PipelineEventPublisher : IPipelineEventPublisher, IDisposable
{
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<PipelineEventPublisher> _logger;

    private IConnection? _connection;
    private IModel? _channel;
    private bool _disposed;

    public PipelineEventPublisher(
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<PipelineEventPublisher> logger)
    {
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    public void PublishOhlcvComplete(string assetType, int tickerCount, int recordCount)
    {
        var payload = new
        {
            eventType = "pipeline.ohlcv.complete",
            assetType,
            timestamp = DateTime.UtcNow.ToString("o"),
            tickerCount,
            recordCount
        };

        Publish(_rabbitSettings.PipelineOhlcvCompleteQueue, payload);
    }

    public void PublishComputeComplete(string assetType, string[] completedSteps)
    {
        var payload = new
        {
            eventType = "pipeline.compute.complete",
            assetType,
            timestamp = DateTime.UtcNow.ToString("o"),
            completedSteps
        };

        Publish(_rabbitSettings.PipelineComputeCompleteQueue, payload);
    }

    public void PublishAnalysisComplete(string assetType, int priceTargetsComputed)
    {
        var payload = new
        {
            eventType = "pipeline.analysis.complete",
            assetType,
            timestamp = DateTime.UtcNow.ToString("o"),
            priceTargetsComputed
        };

        Publish(_rabbitSettings.PipelineAnalysisCompleteQueue, payload);
    }

    private void Publish(string queueName, object payload)
    {
        try
        {
            EnsureConnection();

            _channel!.QueueDeclare(
                queue: queueName,
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: null);

            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
            var properties = _channel.CreateBasicProperties();
            properties.Persistent = true;
            properties.ContentType = "application/json";

            _channel.BasicPublish("", queueName, properties, body);

            _logger.LogInformation(
                "Published pipeline event to {Queue}: {Payload}",
                queueName, JsonSerializer.Serialize(payload));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to publish pipeline event to {Queue} (non-fatal)", queueName);
        }
    }

    private void EnsureConnection()
    {
        if (_connection is { IsOpen: true } && _channel is { IsOpen: true })
            return;

        _channel?.Dispose();
        _connection?.Dispose();

        var factory = new ConnectionFactory
        {
            HostName = _rabbitSettings.HostName,
            UserName = _rabbitSettings.UserName,
            Password = _rabbitSettings.Password,
            Port = _rabbitSettings.Port
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();
    }
}
