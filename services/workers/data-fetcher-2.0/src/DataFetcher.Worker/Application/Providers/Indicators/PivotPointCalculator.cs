using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class PivotPointCalculator : IIndicatorCalculator
{
    public string Name => "PivotPoints";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 2;
    public string[] OutputColumns => ["pivot_levels"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["pivot_levels"] = null };

        if (bars.Count < MinDataPoints) return result;

        var prevBar = bars[^2];
        result["pivot_levels"] = AdvancedIndicatorCalculatorService.ComputePivotLevelsJson(prevBar);

        return result;
    }
}
