using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class StochasticCalculator : IIndicatorCalculator
{
    public string Name => "Stochastic";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 17;
    public string[] OutputColumns => ["stoch_k", "stoch_d"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["stoch_k"] = null, ["stoch_d"] = null };

        if (bars.Count < MinDataPoints) return result;

        var highs = bars.Select(b => b.High).ToList();
        var lows = bars.Select(b => b.Low).ToList();
        var closes = bars.Select(b => b.Close).ToList();
        var stoch = AdvancedIndicatorCalculatorService.ComputeStochastic(highs, lows, closes, 14, 3);
        result["stoch_k"] = stoch.K;
        result["stoch_d"] = stoch.D;

        return result;
    }
}
