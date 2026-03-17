using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class RsiCalculator : IIndicatorCalculator
{
    public string Name => "RSI";
    public IndicatorCategory Category => IndicatorCategory.Basic;
    public int MinDataPoints => 15;
    public string[] OutputColumns => ["rsi"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["rsi"] = null };

        if (bars.Count < MinDataPoints) return result;

        var closes = bars.Select(b => b.Close).ToList();
        result["rsi"] = LocalIndicatorCalculatorService.ComputeRsi(closes, 14);

        return result;
    }
}
