namespace DataFetcher.Worker.Application.Providers.Pipeline;

public interface IComputeStep
{
    string StepName { get; }
    int Priority { get; }
    string[] DependsOn { get; }
    string[] WritesToTables { get; }
    string[] ReadsFromTables { get; }
    bool AppliesTo(string assetType);

    Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct);
    Task<ComputeStepResult> BackfillAsync(BackfillContext ctx, CancellationToken ct);
}
