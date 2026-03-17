using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class BollingerBandsCalculator : IIndicatorCalculator
{
    public string Name => "BollingerBands";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 20;
    public string[] OutputColumns => ["bollinger_upper", "bollinger_lower", "bollinger_middle", "bollinger_bandwidth"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?>
        {
            ["bollinger_upper"] = null,
            ["bollinger_lower"] = null,
            ["bollinger_middle"] = null,
            ["bollinger_bandwidth"] = null
        };

        if (bars.Count < MinDataPoints) return result;

        var closes = bars.Select(b => b.Close).ToList();
        var bb = AdvancedIndicatorCalculatorService.ComputeBollingerBands(closes, 20, 2.0m);
        result["bollinger_upper"] = bb.Upper;
        result["bollinger_lower"] = bb.Lower;
        result["bollinger_middle"] = bb.Middle;
        result["bollinger_bandwidth"] = bb.Bandwidth;

        return result;
    }
}
