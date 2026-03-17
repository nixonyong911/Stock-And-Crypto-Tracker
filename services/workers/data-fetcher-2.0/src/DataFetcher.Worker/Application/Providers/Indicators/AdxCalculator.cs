using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class AdxCalculator : IIndicatorCalculator
{
    public string Name => "ADX";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 28;
    public string[] OutputColumns => ["adx"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["adx"] = null };

        if (bars.Count < MinDataPoints) return result;

        var highs = bars.Select(b => b.High).ToList();
        var lows = bars.Select(b => b.Low).ToList();
        var closes = bars.Select(b => b.Close).ToList();
        result["adx"] = AdvancedIndicatorCalculatorService.ComputeAdx(highs, lows, closes, 14);

        return result;
    }
}
