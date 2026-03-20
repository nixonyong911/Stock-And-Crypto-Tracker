namespace DataFetcher.Worker.Application.Providers.Pipeline;

public record PipelineContext(string AssetType, DateOnly AnalyzeDate);

public record ComputeStepResult(int Processed, int Skipped, string? Error = null)
{
    public bool Success => Error == null;
}
