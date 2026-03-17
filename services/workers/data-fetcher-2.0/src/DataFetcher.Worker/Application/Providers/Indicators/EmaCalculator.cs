using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class EmaCalculator : IIndicatorCalculator
{
    public string Name => "EMA";
    public IndicatorCategory Category => IndicatorCategory.Basic;
    public int MinDataPoints => 20;
    public string[] OutputColumns => ["ema"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["ema"] = null };

        if (bars.Count < MinDataPoints) return result;

        var closes = bars.Select(b => b.Close).ToList();
        result["ema"] = LocalIndicatorCalculatorService.ComputeEma(closes, 20);

        return result;
    }
}
