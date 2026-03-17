using DataFetcher.Worker.Application.Providers.LocalIndicators;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Application.Providers.Indicators;

public class MacdCalculator : IIndicatorCalculator
{
    public string Name => "MACD";
    public IndicatorCategory Category => IndicatorCategory.Basic;
    public int MinDataPoints => 26;
    public string[] OutputColumns => ["macd_value", "macd_signal", "macd_histogram"];

    public Dictionary<string, object?> Compute(List<OhlcvBar> bars)
    {
        var result = new Dictionary<string, object?>
        {
            ["macd_value"] = null,
            ["macd_signal"] = null,
            ["macd_histogram"] = null
        };

        if (bars.Count < MinDataPoints) return result;

        var closes = bars.Select(b => b.Close).ToList();

        var ema12Series = LocalIndicatorCalculatorService.ComputeEmaSeries(closes, 12);
        var ema26Series = LocalIndicatorCalculatorService.ComputeEmaSeries(closes, 26);

        var minLen = Math.Min(ema12Series.Count, ema26Series.Count);
        var offset12 = ema12Series.Count - minLen;
        var offset26 = ema26Series.Count - minLen;

        var macdSeries = new List<decimal>(minLen);
        for (int i = 0; i < minLen; i++)
            macdSeries.Add(ema12Series[offset12 + i] - ema26Series[offset26 + i]);

        result["macd_value"] = Math.Round(macdSeries[^1], 6);

        if (macdSeries.Count >= 9)
        {
            var signalSeries = LocalIndicatorCalculatorService.ComputeEmaSeries(macdSeries, 9);
            var signal = Math.Round(signalSeries[^1], 6);
            result["macd_signal"] = signal;
            result["macd_histogram"] = Math.Round((decimal)result["macd_value"]! - signal, 6);
        }

        return result;
    }
}
