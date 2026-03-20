namespace DataFetcher.Worker.Application.Providers.Pipeline;

public interface IComputeStepRegistry
{
    IReadOnlyList<IComputeStep> GetAll();
    IReadOnlyList<IComputeStep> GetForAssetType(string assetType);
    IReadOnlyList<IReadOnlyList<IComputeStep>> GetExecutionPhases(string assetType);
}

public class ComputeStepRegistry : IComputeStepRegistry
{
    private readonly IReadOnlyList<IComputeStep> _steps;

    public ComputeStepRegistry(IEnumerable<IComputeStep> steps)
    {
        _steps = steps.ToList().AsReadOnly();
    }

    public IReadOnlyList<IComputeStep> GetAll() => _steps;

    public IReadOnlyList<IComputeStep> GetForAssetType(string assetType)
        => _steps.Where(s => s.AppliesTo(assetType)).ToList().AsReadOnly();

    public IReadOnlyList<IReadOnlyList<IComputeStep>> GetExecutionPhases(string assetType)
        => TopologicalSortHelper.Sort(GetForAssetType(assetType));
}
