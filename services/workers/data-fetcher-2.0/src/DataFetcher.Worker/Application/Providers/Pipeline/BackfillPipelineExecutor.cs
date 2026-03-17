using System.Diagnostics;

namespace DataFetcher.Worker.Application.Providers.Pipeline;

public interface IBackfillPipelineExecutor
{
    Task<PipelineResult> ExecuteAsync(BackfillContext context, CancellationToken ct);
}

public class PipelineResult
{
    public bool Success { get; set; }
    public List<StepOutcome> StepOutcomes { get; set; } = new();
    public TimeSpan Duration { get; set; }
}

public class StepOutcome
{
    public string StepName { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? Error { get; set; }
    public TimeSpan Duration { get; set; }
}

public class BackfillPipelineExecutor : IBackfillPipelineExecutor
{
    private static readonly TimeSpan StepTimeout = TimeSpan.FromMinutes(5);

    private readonly IEnumerable<IBackfillStep> _steps;
    private readonly ILogger<BackfillPipelineExecutor> _logger;

    public BackfillPipelineExecutor(
        IEnumerable<IBackfillStep> steps,
        ILogger<BackfillPipelineExecutor> logger)
    {
        _steps = steps;
        _logger = logger;
    }

    public async Task<PipelineResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        var pipelineStopwatch = Stopwatch.StartNew();
        var result = new PipelineResult();

        var applicableSteps = _steps
            .Where(s => s.AppliesTo(context.AssetType))
            .OrderBy(s => s.Order)
            .ToList();

        _logger.LogInformation(
            "Starting backfill pipeline for {Symbol} ({AssetType}) with {StepCount} steps",
            context.Symbol, context.AssetType, applicableSteps.Count);

        foreach (var step in applicableSteps)
        {
            var stepStopwatch = Stopwatch.StartNew();
            var outcome = new StepOutcome { StepName = step.Name };

            _logger.LogInformation("Starting step [{StepName}] (order {Order}) for {Symbol}",
                step.Name, step.Order, context.Symbol);

            try
            {
                using var stepCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                stepCts.CancelAfter(StepTimeout);

                var stepResult = await step.ExecuteAsync(context, stepCts.Token);
                outcome.Success = stepResult.Success;
                outcome.Error = stepResult.Error;
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                outcome.Success = false;
                outcome.Error = $"Step [{step.Name}] timed out after {StepTimeout.TotalMinutes} minutes";
                _logger.LogWarning("Step [{StepName}] timed out for {Symbol}", step.Name, context.Symbol);
            }
            catch (Exception ex)
            {
                outcome.Success = false;
                outcome.Error = ex.Message;
                _logger.LogError(ex, "Step [{StepName}] failed for {Symbol}", step.Name, context.Symbol);
            }

            stepStopwatch.Stop();
            outcome.Duration = stepStopwatch.Elapsed;
            result.StepOutcomes.Add(outcome);

            _logger.LogInformation(
                "Step [{StepName}] completed for {Symbol}: Success={Success}, Duration={Duration:F1}s",
                step.Name, context.Symbol, outcome.Success, outcome.Duration.TotalSeconds);
        }

        pipelineStopwatch.Stop();
        result.Duration = pipelineStopwatch.Elapsed;
        result.Success = result.StepOutcomes.Any(o => o.Success);

        _logger.LogInformation(
            "Backfill pipeline completed for {Symbol}: {Succeeded}/{Total} steps succeeded, Duration={Duration:F1}s",
            context.Symbol,
            result.StepOutcomes.Count(o => o.Success),
            result.StepOutcomes.Count,
            result.Duration.TotalSeconds);

        return result;
    }
}
