using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class FibonacciCalculator : IIndicatorCalculator
{
    public string Name => "Fibonacci";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 14;
    public string[] OutputColumns => ["fibonacci_levels"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["fibonacci_levels"] = null };

        if (bars.Count < MinDataPoints) return result;

        var n = bars.Count;
        var fibBars = n >= 50 ? bars.Skip(n - 50).ToList() : bars;
        result["fibonacci_levels"] = AdvancedIndicatorCalculatorService.ComputeFibonacciLevelsJson(fibBars);

        return result;
    }
}
