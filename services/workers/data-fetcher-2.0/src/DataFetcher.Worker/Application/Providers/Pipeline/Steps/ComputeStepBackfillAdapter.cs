namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

/// <summary>
/// Adapts an IComputeStep into an IBackfillStep so the existing
/// BackfillPipelineExecutor automatically includes compute steps
/// registered in the IComputeStepRegistry.
/// </summary>
public class ComputeStepBackfillAdapter : IBackfillStep
{
    private readonly IComputeStep _inner;

    public ComputeStepBackfillAdapter(IComputeStep inner)
    {
        _inner = inner;
    }

    public string Name => _inner.StepName;
    public int Order => _inner.Priority;
    public bool AppliesTo(string assetType) => _inner.AppliesTo(assetType);

    public async Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct)
    {
        var result = await _inner.BackfillAsync(context, ct);
        return new StepResult(result.Success, result.Error);
    }
}
