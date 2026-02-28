using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DataFetcher.Worker.Workers.CandlestickAnalysis;

/// <summary>
/// Background service that consumes analysis backfill requests from RabbitMQ queue.
/// Uses FIFO processing with prefetch=1 to ensure only one symbol is processed at a time.
/// </summary>
public class AnalysisBackfillQueueConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<AnalysisBackfillQueueConsumer> _logger;

    private IConnection? _connection;
    private IModel? _channel;

    public AnalysisBackfillQueueConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<AnalysisBackfillQueueConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AnalysisBackfillQueueConsumer starting...");

        await WaitForRabbitMQAsync(stoppingToken);

        if (stoppingToken.IsCancellationRequested)
            return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);

            _logger.LogInformation(
                "AnalysisBackfillQueueConsumer started - listening on queue: {Queue}",
                _rabbitSettings.AnalysisBackfillQueueName);

            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("AnalysisBackfillQueueConsumer stopping due to cancellation");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in AnalysisBackfillQueueConsumer");
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
                _logger.LogInformation("Successfully connected to RabbitMQ for analysis backfill consumer");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "RabbitMQ not ready for analysis consumer (attempt {Attempt}/{MaxRetries}): {Message}",
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
            queue: _rabbitSettings.AnalysisBackfillQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        // CRITICAL: Set prefetch to 1 for FIFO processing
        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);

        _logger.LogInformation(
            "RabbitMQ initialized for analysis backfill - Queue: {Queue}, Prefetch: 1 (FIFO mode)",
            _rabbitSettings.AnalysisBackfillQueueName);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);

        consumer.Received += async (model, ea) =>
        {
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);

            _logger.LogInformation("Received analysis backfill message: {Message}", message);

            try
            {
                var request = JsonSerializer.Deserialize<AnalysisBackfillRequest>(message);

                if (request == null || string.IsNullOrEmpty(request.Symbol))
                {
                    _logger.LogWarning("Invalid analysis backfill request received: {Message}", message);
                    _channel?.BasicAck(ea.DeliveryTag, multiple: false);
                    return;
                }

                await ProcessBackfillRequestAsync(request, stoppingToken);

                _channel?.BasicAck(ea.DeliveryTag, multiple: false);

                _logger.LogInformation(
                    "Analysis backfill completed and acknowledged for {Symbol}",
                    request.Symbol);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogWarning("Analysis backfill processing cancelled - message will be requeued");
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing analysis backfill message: {Message}", message);
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
        };

        _channel.BasicConsume(
            queue: _rabbitSettings.AnalysisBackfillQueueName,
            autoAck: false,
            consumer: consumer);
    }

    private async Task ProcessBackfillRequestAsync(AnalysisBackfillRequest request, CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Processing {AssetType} analysis backfill for {Symbol} (requested at: {RequestedAt})",
            request.AssetType, request.Symbol, request.RequestedAt);

        using var scope = _serviceProvider.CreateScope();

        AnalysisBackfillResult result;

        if (request.AssetType == "crypto")
        {
            var cryptoBackfillService = scope.ServiceProvider.GetRequiredService<ICryptoAnalysisBackfillService>();
            result = await cryptoBackfillService.ExecuteBackfillAsync(request, stoppingToken);
        }
        else
        {
            var backfillService = scope.ServiceProvider.GetRequiredService<IAnalysisBackfillService>();
            result = await backfillService.ExecuteBackfillAsync(request, stoppingToken);
        }

        if (result.Success)
        {
            _logger.LogInformation(
                "{AssetType} analysis backfill successful for {Symbol}: {Dates} dates, {Patterns} patterns ({Duration:F1}s)",
                request.AssetType, result.Symbol, result.DatesAnalyzed, result.PatternsDetected, result.Duration.TotalSeconds);
        }
        else
        {
            _logger.LogError(
                "{AssetType} analysis backfill failed for {Symbol}: {Error}",
                request.AssetType, result.Symbol, result.Error);

            throw new InvalidOperationException($"Analysis backfill failed for {request.Symbol}: {result.Error}");
        }
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();

        _logger.LogInformation("AnalysisBackfillQueueConsumer disposed");

        base.Dispose();
    }
}
