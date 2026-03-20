namespace DataFetcher.Worker.Configuration;

/// <summary>
/// Configuration settings for RabbitMQ connection.
/// </summary>
public class RabbitMQSettings
{
    /// <summary>
    /// RabbitMQ server hostname.
    /// </summary>
    public string HostName { get; set; } = "rabbitmq";

    /// <summary>
    /// RabbitMQ connection username.
    /// </summary>
    public string UserName { get; set; } = "stocktracker";

    /// <summary>
    /// RabbitMQ connection password.
    /// </summary>
    public string Password { get; set; } = string.Empty;

    /// <summary>
    /// RabbitMQ server port.
    /// </summary>
    public int Port { get; set; } = 5672;

    /// <summary>
    /// Queue name for Massive indicator processing messages.
    /// </summary>
    public string MassiveQueueName { get; set; } = "massive-indicator-queue";

    /// <summary>
    /// Queue name for candlestick analysis backfill processing messages.
    /// </summary>
    public string AnalysisBackfillQueueName { get; set; } = "analysis-backfill-queue";

    /// <summary>
    /// Queue name for backfill processing messages.
    /// </summary>
    public string BackfillQueueName { get; set; } = "backfill-queue";

    /// <summary>
    /// Queue name for crypto backfill processing messages.
    /// </summary>
    public string CryptoBackfillQueueName { get; set; } = "crypto-backfill-queue";

    /// <summary>
    /// Queue name for pipeline OHLCV complete events.
    /// </summary>
    public string PipelineOhlcvCompleteQueue { get; set; } = "pipeline-ohlcv-complete";

    /// <summary>
    /// Queue name for pipeline compute complete events.
    /// </summary>
    public string PipelineComputeCompleteQueue { get; set; } = "pipeline-compute-complete";

    /// <summary>
    /// Queue name for pipeline analysis complete events.
    /// </summary>
    public string PipelineAnalysisCompleteQueue { get; set; } = "pipeline-analysis-complete";
}
