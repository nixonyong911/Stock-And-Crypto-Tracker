using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class AtrCalculator : IIndicatorCalculator
{
    public string Name => "ATR";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 15;
    public string[] OutputColumns => ["atr"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["atr"] = null };

        if (bars.Count < MinDataPoints) return result;

        var highs = bars.Select(b => b.High).ToList();
        var lows = bars.Select(b => b.Low).ToList();
        var closes = bars.Select(b => b.Close).ToList();
        result["atr"] = AdvancedIndicatorCalculatorService.ComputeAtr(highs, lows, closes, 14);

        return result;
    }
}
