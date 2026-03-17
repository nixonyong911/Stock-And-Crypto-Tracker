using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class IchimokuCalculator : IIndicatorCalculator
{
    public string Name => "Ichimoku";
    public IndicatorCategory Category => IndicatorCategory.Advanced;
    public int MinDataPoints => 52;
    public string[] OutputColumns => ["ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b", "ichimoku_chikou"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?>
        {
            ["ichimoku_tenkan"] = null,
            ["ichimoku_kijun"] = null,
            ["ichimoku_senkou_a"] = null,
            ["ichimoku_senkou_b"] = null,
            ["ichimoku_chikou"] = null
        };

        if (bars.Count < MinDataPoints) return result;

        var highs = bars.Select(b => b.High).ToList();
        var lows = bars.Select(b => b.Low).ToList();
        var closes = bars.Select(b => b.Close).ToList();
        var ich = AdvancedIndicatorCalculatorService.ComputeIchimoku(highs, lows, closes, 9, 26, 52);
        result["ichimoku_tenkan"] = ich.Tenkan;
        result["ichimoku_kijun"] = ich.Kijun;
        result["ichimoku_senkou_a"] = ich.SenkouA;
        result["ichimoku_senkou_b"] = ich.SenkouB;
        result["ichimoku_chikou"] = ich.Chikou;

        return result;
    }
}
