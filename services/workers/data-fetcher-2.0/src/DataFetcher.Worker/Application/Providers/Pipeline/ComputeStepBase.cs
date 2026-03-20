namespace DataFetcher.Worker.Application.Providers.Pipeline;

public abstract class ComputeStepBase : IComputeStep
{
    public abstract string StepName { get; }
    public virtual int Priority => 100;
    public virtual string[] DependsOn => [];
    public abstract string[] WritesToTables { get; }
    public virtual string[] ReadsFromTables => [];
    public virtual bool AppliesTo(string assetType) => true;

    public abstract Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct);

    public virtual Task<ComputeStepResult> BackfillAsync(BackfillContext ctx, CancellationToken ct)
        => ExecuteAsync(ctx.ToPipelineContext(), ct);
}

public static class BackfillContextExtensions
{
    public static PipelineContext ToPipelineContext(this BackfillContext ctx)
        => new(ctx.AssetType, DateOnly.FromDateTime(DateTime.UtcNow));
}
