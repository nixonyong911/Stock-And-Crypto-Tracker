namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Pure moving-average math over chronologically-ordered daily closes,
/// shared by the stock (eToro bars) and crypto (Alpaca bars) trend-metric
/// services. All methods return null when the series is too short for an
/// honest value — an under-seeded long MA is worse than no MA.
/// </summary>
public static class TrendMath
{
    /// <summary>
    /// Minimum series length before an EMA-50 is considered converged.
    /// The EMA seed (SMA of the first period) decays by ~2/51 per bar;
    /// 200 bars leaves under 0.3% seed influence.
    /// </summary>
    public const int Ema50MinBars = 200;

    /// <summary>Simple average of the last <paramref name="period"/> closes.</summary>
    public static decimal? Sma(IReadOnlyList<decimal> closes, int period)
    {
        if (closes.Count < period) return null;
        decimal sum = 0;
        for (var i = closes.Count - period; i < closes.Count; i++)
            sum += closes[i];
        return Math.Round(sum / period, 6);
    }

    /// <summary>
    /// EMA over the full series, seeded with the SMA of the first
    /// <paramref name="period"/> values (same convention as
    /// LocalIndicatorCalculatorService.ComputeEmaSeries). Returns null when
    /// fewer than <paramref name="minBars"/> values exist.
    /// </summary>
    public static decimal? Ema(IReadOnlyList<decimal> closes, int period, int minBars)
    {
        if (closes.Count < Math.Max(period, minBars)) return null;

        decimal seed = 0;
        for (var i = 0; i < period; i++) seed += closes[i];
        var ema = seed / period;

        var multiplier = 2m / (period + 1);
        for (var i = period; i < closes.Count; i++)
            ema = (closes[i] - ema) * multiplier + ema;

        return Math.Round(ema, 6);
    }
}
