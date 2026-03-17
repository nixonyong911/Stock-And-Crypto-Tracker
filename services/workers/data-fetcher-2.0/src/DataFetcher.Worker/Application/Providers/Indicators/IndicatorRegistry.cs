namespace DataFetcher.Worker.Application.Providers.Indicators;

public interface IIndicatorRegistry
{
    IReadOnlyList<IIndicatorCalculator> GetAll();
    IReadOnlyList<IIndicatorCalculator> GetAdvanced();
    IReadOnlyList<IIndicatorCalculator> GetBasic();
}

public class IndicatorRegistry : IIndicatorRegistry
{
    private readonly IReadOnlyList<IIndicatorCalculator> _all;
    private readonly IReadOnlyList<IIndicatorCalculator> _advanced;
    private readonly IReadOnlyList<IIndicatorCalculator> _basic;

    public IndicatorRegistry(IEnumerable<IIndicatorCalculator> calculators)
    {
        _all = calculators.ToList().AsReadOnly();
        _advanced = _all.Where(c => c.Category == IndicatorCategory.Advanced).ToList().AsReadOnly();
        _basic = _all.Where(c => c.Category == IndicatorCategory.Basic).ToList().AsReadOnly();
    }

    public IReadOnlyList<IIndicatorCalculator> GetAll() => _all;
    public IReadOnlyList<IIndicatorCalculator> GetAdvanced() => _advanced;
    public IReadOnlyList<IIndicatorCalculator> GetBasic() => _basic;
}
