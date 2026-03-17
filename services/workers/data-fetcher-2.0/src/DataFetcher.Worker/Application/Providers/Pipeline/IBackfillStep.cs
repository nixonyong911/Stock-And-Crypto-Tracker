namespace DataFetcher.Worker.Application.Providers.Pipeline;

public interface IBackfillStep
{
    string Name { get; }
    int Order { get; }
    bool AppliesTo(string assetType);
    Task<StepResult> ExecuteAsync(BackfillContext context, CancellationToken ct);
}

public record StepResult(bool Success, string? Error = null);
