using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class ObvCalculator : IIndicatorCalculator
{
    public string Name => "OBV";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 2;
    public string[] OutputColumns => ["obv"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["obv"] = null };

        if (bars.Count < MinDataPoints) return result;

        var closes = bars.Select(b => b.Close).ToList();
        var volumes = bars.Select(b => b.Volume).ToList();
        result["obv"] = AdvancedIndicatorCalculatorService.ComputeObv(closes, volumes);

        return result;
    }
}
