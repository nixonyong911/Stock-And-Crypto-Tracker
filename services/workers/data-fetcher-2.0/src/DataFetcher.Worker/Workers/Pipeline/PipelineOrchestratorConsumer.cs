using System.Diagnostics;
using System.Text;
using System.Text.Json;
using DataFetcher.Worker.Application.Providers.Pipeline;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DataFetcher.Worker.Workers.Pipeline;

public class PipelineOrchestratorConsumer : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly RabbitMQSettings _rabbitSettings;
    private readonly ILogger<PipelineOrchestratorConsumer> _logger;

    private IConnection? _connection;
    private IModel? _channel;

    private static readonly TimeZoneInfo EasternTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public PipelineOrchestratorConsumer(
        IServiceProvider serviceProvider,
        IOptions<RabbitMQSettings> rabbitSettings,
        ILogger<PipelineOrchestratorConsumer> logger)
    {
        _serviceProvider = serviceProvider;
        _rabbitSettings = rabbitSettings.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PipelineOrchestratorConsumer starting...");

        await WaitForRabbitMQAsync(stoppingToken);

        if (stoppingToken.IsCancellationRequested)
            return;

        try
        {
            InitializeRabbitMQ();
            StartConsuming(stoppingToken);

            _logger.LogInformation(
                "PipelineOrchestratorConsumer started - listening on queue: {Queue}",
                _rabbitSettings.PipelineOhlcvCompleteQueue);

            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("PipelineOrchestratorConsumer stopping due to cancellation");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in PipelineOrchestratorConsumer");
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
                _logger.LogInformation("Successfully connected to RabbitMQ for pipeline orchestrator");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    "RabbitMQ not ready for pipeline orchestrator (attempt {Attempt}/{MaxRetries}): {Message}",
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
            queue: _rabbitSettings.PipelineOhlcvCompleteQueue,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null);

        _channel.BasicQos(prefetchSize: 0, prefetchCount: 1, global: false);

        _logger.LogInformation(
            "RabbitMQ initialized for pipeline orchestrator - Queue: {Queue}, Prefetch: 1",
            _rabbitSettings.PipelineOhlcvCompleteQueue);
    }

    private void StartConsuming(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);

        consumer.Received += async (model, ea) =>
        {
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);

            _logger.LogInformation("Received pipeline OHLCV complete message: {Message}", message);

            try
            {
                var doc = JsonDocument.Parse(message);
                var assetType = doc.RootElement.TryGetProperty("assetType", out var at)
                    ? at.GetString() ?? "stock"
                    : "stock";

                await RunComputePipelineAsync(assetType, stoppingToken);

                _channel?.BasicAck(ea.DeliveryTag, multiple: false);

                _logger.LogInformation(
                    "Pipeline orchestration completed and acknowledged for {AssetType}", assetType);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                _logger.LogWarning("Pipeline orchestration cancelled - message will be requeued");
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing pipeline OHLCV message: {Message}", message);
                _channel?.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
            }
        };

        _channel.BasicConsume(
            queue: _rabbitSettings.PipelineOhlcvCompleteQueue,
            autoAck: false,
            consumer: consumer);
    }

    private async Task RunComputePipelineAsync(string assetType, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var startedAt = DateTime.UtcNow;
        var status = "unknown";
        string? errorMessage = null;
        var completedSteps = new List<string>();

        var easternNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, EasternTimeZone);
        var analyzeDate = DateOnly.FromDateTime(easternNow);

        _logger.LogInformation(
            "Starting compute pipeline for {AssetType} (analyzeDate={Date})",
            assetType, analyzeDate);

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var registry = scope.ServiceProvider.GetRequiredService<IComputeStepRegistry>();
            var phases = registry.GetExecutionPhases(assetType);

            var ctx = new PipelineContext(assetType, analyzeDate);

            _logger.LogInformation(
                "Pipeline has {PhaseCount} phases with {StepCount} total steps for {AssetType}",
                phases.Count,
                phases.Sum(p => p.Count),
                assetType);

            var totalProcessed = 0;

            for (var i = 0; i < phases.Count; i++)
            {
                var phase = phases[i];
                var phaseStepNames = string.Join(", ", phase.Select(s => s.StepName));
                _logger.LogInformation("Phase {Phase}: {Steps} for {AssetType}", i, phaseStepNames, assetType);

                var results = await Task.WhenAll(
                    phase.Select(async step =>
                    {
                        var result = await step.ExecuteAsync(ctx, ct);
                        return (step.StepName, result);
                    }));

                foreach (var (stepName, result) in results)
                {
                    completedSteps.Add(stepName);
                    totalProcessed += result.Processed;

                    if (result.Error != null)
                        _logger.LogWarning("Step {Step} completed with error: {Error}", stepName, result.Error);
                }
            }

            using (var pubScope = _serviceProvider.CreateScope())
            {
                var publisher = pubScope.ServiceProvider.GetRequiredService<IPipelineEventPublisher>();
                publisher.PublishAnalysisComplete(assetType, totalProcessed);
            }

            status = "completed";

            _logger.LogInformation(
                "Compute pipeline completed for {AssetType} in {Duration:F1}s — steps: {Steps}",
                assetType, sw.Elapsed.TotalSeconds, string.Join(", ", completedSteps));
        }
        catch (Exception ex)
        {
            status = "failed";
            errorMessage = ex.Message;
            _logger.LogError(ex,
                "Compute pipeline failed for {AssetType} after steps: {Steps}",
                assetType, string.Join(", ", completedSteps));
            throw;
        }
        finally
        {
            sw.Stop();
            await LogPipelineExecutionAsync(assetType, status, errorMessage, (int)sw.ElapsedMilliseconds, startedAt);
        }
    }

    private async Task LogPipelineExecutionAsync(
        string assetType, string status, string? message, int durationMs, DateTime startedAt)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var scheduleRepo = scope.ServiceProvider.GetRequiredService<IFetchScheduleRepository>();

            var scheduleName = $"pipeline-orchestrator-{assetType}";
            var schedule = await scheduleRepo.GetScheduleByNameAsync(scheduleName);

            if (schedule != null)
            {
                await scheduleRepo.UpdateLastRunAsync(schedule.Id, status, message);
                await scheduleRepo.LogExecutionAsync(schedule.Id, status, message, durationMs, startedAt);
            }
            else
            {
                _logger.LogDebug(
                    "No schedule found for '{Name}' — pipeline execution not logged to DB", scheduleName);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to log pipeline execution for {AssetType} (non-fatal)", assetType);
        }
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();

        _logger.LogInformation("PipelineOrchestratorConsumer disposed");

        base.Dispose();
    }
}
