namespace DataFetcher.Worker.Application.Providers.Indicators;

public interface IIndicatorRegistry
{
    IReadOnlyList<IIndicatorCalculator> GetAll();
    IReadOnlyList<IIndicatorCalculator> GetAdvanced();
    IReadOnlyList<IIndicatorCalculator> GetBasic();

    IReadOnlyList<IIndicatorDefinition> GetAllDefinitions();
    IReadOnlyList<IIndicatorDefinition> GetByCategory(IndicatorCategory category);
    IReadOnlyList<IIndicatorDefinition> GetForAssetType(string assetType);
    IReadOnlyList<ScheduleConfig> GetAllSchedules();
    IReadOnlyList<string> GetAllOutputColumns(string assetType);
}

public class IndicatorRegistry : IIndicatorRegistry
{
    private readonly IReadOnlyList<IIndicatorCalculator> _all;
    private readonly IReadOnlyList<IIndicatorCalculator> _advanced;
    private readonly IReadOnlyList<IIndicatorCalculator> _basic;
    private readonly IReadOnlyList<IIndicatorDefinition> _definitions;

    public IndicatorRegistry(
        IEnumerable<IIndicatorCalculator> calculators,
        IEnumerable<IIndicatorDefinition> definitions)
    {
        _all = calculators.ToList().AsReadOnly();
        _advanced = _all.Where(c => c.Category == IndicatorCategory.Advanced).ToList().AsReadOnly();
        _basic = _all.Where(c => c.Category == IndicatorCategory.Basic).ToList().AsReadOnly();
        _definitions = definitions.ToList().AsReadOnly();
    }

    public IReadOnlyList<IIndicatorCalculator> GetAll() => _all;
    public IReadOnlyList<IIndicatorCalculator> GetAdvanced() => _advanced;
    public IReadOnlyList<IIndicatorCalculator> GetBasic() => _basic;

    public IReadOnlyList<IIndicatorDefinition> GetAllDefinitions() => _definitions;

    public IReadOnlyList<IIndicatorDefinition> GetByCategory(IndicatorCategory category)
        => _definitions.Where(d => d.Category == category).ToList().AsReadOnly();

    public IReadOnlyList<IIndicatorDefinition> GetForAssetType(string assetType)
        => _definitions.Where(d => d.AppliesTo(assetType)).ToList().AsReadOnly();

    public IReadOnlyList<ScheduleConfig> GetAllSchedules()
        => _definitions.Select(d => d.GetScheduleConfig()).Distinct().ToList().AsReadOnly();

    public IReadOnlyList<string> GetAllOutputColumns(string assetType)
        => _definitions
            .Where(d => d.AppliesTo(assetType))
            .SelectMany(d => d.OutputColumns)
            .Distinct()
            .ToList()
            .AsReadOnly();
}
