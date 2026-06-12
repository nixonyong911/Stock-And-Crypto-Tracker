using System.Text.Json;
using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public class PriceTargetCalculatorService : IPriceTargetCalculatorService
{
    /// <summary>
    /// Short-horizon indicators from analysis_indicators_*_free. Sma20 was
    /// historically mislabeled "Ema50" — it is the 20-day simple MA.
    /// </summary>
    public record IndicatorSnapshot(decimal? Ema20, decimal? Sma20, decimal? Rsi);
    /// <summary>
    /// Long-horizon daily MAs from analysis_stock_trend_metrics /
    /// analysis_crypto_range_52w (eToro/Alpaca 1Day bars). Null members mean
    /// insufficient bar history.
    /// </summary>
    public record LongTrendSnapshot(decimal? Sma50, decimal? Sma200, decimal? Ema50);
    public record DailyClose(DateOnly Date, decimal Close);
    public record CandleSignal(string Signal);

    public record TargetResult(
        decimal LatestClose,
        decimal? EntryPrice,
        decimal? EntryPriceLow,
        decimal? EntryPriceHigh,
        decimal? TargetPrice,
        decimal? StopLoss,
        string SignalSummary,
        decimal? Confidence,
        string MetadataJson
    );

    public TargetResult Calculate(
        decimal latestClose,
        IReadOnlyList<DailyClose> recentCloses,
        IndicatorSnapshot? indicators,
        IReadOnlyList<CandleSignal> recentSignals,
        PriceTargetParameters parameters,
        LongTrendSnapshot? longTrend = null)
    {
        if (recentCloses.Count == 0)
            return new TargetResult(latestClose, null, null, null, null, null, "neutral", null, "{}");

        var closes = recentCloses.OrderByDescending(c => c.Date).Take(parameters.LookbackDays).ToList();
        var low = closes.Min(c => c.Close);
        var high = closes.Max(c => c.Close);

        decimal? entryPrice = indicators?.Ema20 != null
            ? (indicators.Ema20.Value * 0.6m) + (low * 0.4m)
            : low * 1.01m;

        if (indicators?.Rsi > parameters.OverboughtRsi && entryPrice.HasValue)
            entryPrice = entryPrice.Value * (1m - parameters.OverboughtDiscount);

        decimal? targetPrice = indicators?.Sma20 != null
            ? (indicators.Sma20.Value * 0.4m) + (high * 0.6m)
            : high * 0.99m;

        if (indicators?.Rsi < parameters.OversoldRsi && targetPrice.HasValue)
        {
            var bounceTarget = latestClose * (1m + parameters.OversoldBounce);
            if (bounceTarget > targetPrice.Value)
                targetPrice = bounceTarget;
        }

        if (entryPrice.HasValue && targetPrice.HasValue && targetPrice.Value <= entryPrice.Value)
            targetPrice = entryPrice.Value * 1.05m;

        decimal? stopLoss = null;
        if (entryPrice.HasValue)
        {
            var slFromEntry = entryPrice.Value * (1m - parameters.StopLossPct);
            var slFromLow = low * 0.99m;
            stopLoss = Math.Min(slFromEntry, slFromLow);
        }

        decimal? entryPriceLow = entryPrice.HasValue
            ? Math.Round(entryPrice.Value * (1m - parameters.EntryRangePct), 6)
            : null;
        decimal? entryPriceHigh = entryPrice.HasValue
            ? Math.Round(entryPrice.Value * (1m + parameters.EntryRangePct), 6)
            : null;

        var signal = DetermineSignal(recentSignals, indicators, latestClose, parameters, longTrend);
        var confidence = CalculateConfidence(closes.Count, indicators, parameters.LookbackDays);

        var metadata = new
        {
            lookback_days = closes.Count,
            low_period = low,
            high_period = high,
            ema_20 = indicators?.Ema20,
            sma_20 = indicators?.Sma20,
            ema_50 = longTrend?.Ema50,
            sma_50 = longTrend?.Sma50,
            sma_200 = longTrend?.Sma200,
            rsi = indicators?.Rsi,
            trader_type = parameters.TraderType,
            asset_type = parameters.AssetType,
            stop_loss_pct = parameters.StopLossPct,
            entry_range_pct = parameters.EntryRangePct
        };

        return new TargetResult(
            latestClose,
            entryPrice.HasValue ? Math.Round(entryPrice.Value, 6) : null,
            entryPriceLow,
            entryPriceHigh,
            targetPrice.HasValue ? Math.Round(targetPrice.Value, 6) : null,
            stopLoss.HasValue ? Math.Round(stopLoss.Value, 6) : null,
            signal,
            confidence,
            JsonSerializer.Serialize(metadata)
        );
    }

    private static string DetermineSignal(
        IReadOnlyList<CandleSignal> signals,
        IndicatorSnapshot? indicators,
        decimal latestClose,
        PriceTargetParameters parameters,
        LongTrendSnapshot? longTrend)
    {
        var trendScore = parameters.TraderType == "long_term"
            ? ScoreLongTermTrend(longTrend, indicators, latestClose)
            : ScoreTrend(indicators, latestClose);
        var momentumScore = ScoreMomentum(indicators?.Rsi, parameters);
        var patternScore = ScorePatterns(signals);

        var composite = (trendScore * parameters.TrendWeight)
                      + (momentumScore * parameters.MomentumWeight)
                      + (patternScore * parameters.PatternWeight);

        if (composite > parameters.BullishThreshold) return "bullish";
        if (composite < parameters.BearishThreshold) return "bearish";
        return "neutral";
    }

    private static decimal ScoreTrend(IndicatorSnapshot? indicators, decimal latestClose)
    {
        if (indicators?.Ema20 == null || indicators.Sma20 == null)
            return 0m;

        var ema20 = indicators.Ema20.Value;
        var sma20 = indicators.Sma20.Value;
        var score = ema20 > sma20 ? 1.0m : -1.0m;

        if (latestClose > ema20 && latestClose > sma20)
            score += 0.5m;
        else if (latestClose < ema20 && latestClose < sma20)
            score -= 0.5m;

        return Math.Clamp(score, -1.5m, 1.5m);
    }

    /// <summary>
    /// Long-horizon regime score for the long_term trader profile: position
    /// vs the 200-day MA dominates, the 50/200 cross refines. Falls back to
    /// the short-horizon score when the long MAs are unavailable so the
    /// profile degrades to its historical behavior rather than to neutral.
    /// </summary>
    private static decimal ScoreLongTermTrend(
        LongTrendSnapshot? longTrend,
        IndicatorSnapshot? indicators,
        decimal latestClose)
    {
        if (longTrend?.Sma200 == null)
            return ScoreTrend(indicators, latestClose);

        var sma200 = longTrend.Sma200.Value;
        var score = latestClose > sma200 ? 1.0m : -1.0m;

        if (longTrend.Sma50 != null)
            score += longTrend.Sma50.Value > sma200 ? 0.5m : -0.5m;

        return Math.Clamp(score, -1.5m, 1.5m);
    }

    private static decimal ScoreMomentum(decimal? rsi, PriceTargetParameters parameters)
    {
        if (!rsi.HasValue) return 0m;
        var r = rsi.Value;

        if (r > parameters.OverboughtRsi) return -1.0m;
        if (r < parameters.OversoldRsi) return 1.0m;
        if (r >= 55m) return -0.3m;
        if (r <= 45m) return 0.3m;
        return 0m;
    }

    private static decimal ScorePatterns(IReadOnlyList<CandleSignal> signals)
    {
        if (signals.Count == 0) return 0m;

        var bullish = signals.Count(s => s.Signal.Contains("bullish"));
        var bearish = signals.Count(s => s.Signal.Contains("bearish"));

        if (bullish > bearish) return 1.0m;
        if (bearish > bullish) return -1.0m;
        return 0m;
    }

    private static decimal CalculateConfidence(int dataPoints, IndicatorSnapshot? indicators, int lookbackDays)
    {
        var score = 0m;

        score += Math.Min(dataPoints / (decimal)lookbackDays, 1m) * 0.4m;

        if (indicators != null)
        {
            if (indicators.Ema20.HasValue) score += 0.2m;
            if (indicators.Sma20.HasValue) score += 0.2m;
            if (indicators.Rsi.HasValue) score += 0.2m;
        }

        return Math.Round(score, 4);
    }
}
