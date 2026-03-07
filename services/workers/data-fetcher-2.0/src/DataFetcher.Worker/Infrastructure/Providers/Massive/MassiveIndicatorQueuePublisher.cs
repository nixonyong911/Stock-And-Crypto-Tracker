using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Massive;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.Massive.Models;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive;

public class MassiveIndicatorQueuePublisher : IMassiveIndicatorQueuePublisher
{
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<MassiveIndicatorQueuePublisher> _logger;

    public MassiveIndicatorQueuePublisher(
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<MassiveIndicatorQueuePublisher> logger)
    {
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    public void PublishBackfill(string symbol, int tickerId, string assetType, int days = 90)
    {
        try
        {
            var endDate = DateTime.UtcNow.Date.AddDays(-1);
            var startDate = DateTime.UtcNow.Date.AddDays(-days);
            var indicatorTypes = new[] { "sma", "ema", "macd", "rsi" };

            var factory = new ConnectionFactory
            {
                HostName = _rabbitSettings.HostName,
                UserName = _rabbitSettings.UserName,
                Password = _rabbitSettings.Password,
                Port = _rabbitSettings.Port
            };

            using var connection = factory.CreateConnection();
            using var channel = connection.CreateModel();

            channel.QueueDeclare(
                queue: _rabbitSettings.MassiveQueueName,
                durable: true,
                exclusive: false,
                autoDelete: false);

            foreach (var indicatorType in indicatorTypes)
            {
                var request = new MassiveIndicatorRequest
                {
                    Type = "backfill",
                    Symbol = symbol,
                    TickerId = tickerId,
                    AssetType = assetType,
                    IndicatorType = indicatorType,
                    StartDate = startDate.ToString("yyyy-MM-dd"),
                    EndDate = endDate.ToString("yyyy-MM-dd"),
                    RequestedAt = DateTime.UtcNow
                };

                var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request));
                var properties = channel.CreateBasicProperties();
                properties.Persistent = true;
                properties.ContentType = "application/json";

                channel.BasicPublish("", _rabbitSettings.MassiveQueueName, properties, body);
            }

            _logger.LogInformation(
                "Published 4 Massive indicator backfill requests for {Symbol} ({AssetType})",
                symbol, assetType);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to publish Massive indicator backfill for {Symbol} (non-fatal)", symbol);
        }
    }
}
