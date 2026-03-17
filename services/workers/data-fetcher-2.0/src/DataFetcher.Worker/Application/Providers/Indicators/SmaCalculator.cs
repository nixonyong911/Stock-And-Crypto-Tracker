using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class SmaCalculator : IIndicatorCalculator
{
    public string Name => "SMA";
    public IndicatorCategory Category => IndicatorCategory.Basic;
    public int MinDataPoints => 20;
    public string[] OutputColumns => ["sma"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?> { ["sma"] = null };

        if (bars.Count < MinDataPoints) return result;

        var closes = bars.Select(b => b.Close).ToList();
        var n = closes.Count;
        result["sma"] = Math.Round(closes.Skip(n - 20).Average(), 6);

        return result;
    }
}
