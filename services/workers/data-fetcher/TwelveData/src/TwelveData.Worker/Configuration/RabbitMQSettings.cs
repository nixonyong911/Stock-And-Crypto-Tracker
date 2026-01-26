namespace TwelveData.Worker.Configuration;

/// <summary>
/// Configuration settings for RabbitMQ connection
/// </summary>
public class RabbitMQSettings
{
    public string HostName { get; set; } = "rabbitmq";
    public string UserName { get; set; } = "stocktracker";
    public string Password { get; set; } = string.Empty;

    /// <summary>
    /// Queue name for stock backfill requests
    /// </summary>
    public string QueueName { get; set; } = "backfill-queue";

    /// <summary>
    /// Queue name for crypto backfill requests
    /// </summary>
    public string CryptoQueueName { get; set; } = "crypto-backfill-queue";

    public int Port { get; set; } = 5672;
}
