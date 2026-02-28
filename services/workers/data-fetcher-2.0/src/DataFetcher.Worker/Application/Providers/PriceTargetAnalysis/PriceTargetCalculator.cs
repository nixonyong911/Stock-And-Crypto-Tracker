using System.Text.Json;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

/// <summary>
/// Pure calculation logic for price targets. No DB or I/O dependencies.
/// Methodology: Technical composite using EMA, daily OHLCV, RSI, and candlestick signals.
/// </summary>
public static class PriceTargetCalculator
{
    private const decimal OverboughtRsiThreshold = 70m;
    private const decimal OversoldRsiThreshold = 30m;
    private const decimal OverboughtDiscount = 0.02m;
    private const decimal OversoldBounce = 0.05m;
    private const decimal StopLossPercent = 0.03m;
    private const int LookbackDays = 20;

    public record IndicatorSnapshot(decimal? Ema20, decimal? Ema50, decimal? Rsi);

    public record DailyClose(DateOnly Date, decimal Close);

    public record CandleSignal(string Signal);

    public record TargetResult(
        decimal LatestClose,
        decimal? EntryPrice,
        decimal? TargetPrice,
        decimal? StopLoss,
        string SignalSummary,
        decimal? Confidence,
        string MetadataJson
    );

    public static TargetResult Calculate(
        decimal latestClose,
        IReadOnlyList<DailyClose> recentCloses,
        IndicatorSnapshot? indicators,
        IReadOnlyList<CandleSignal> recentSignals)
    {
        if (recentCloses.Count == 0)
            return new TargetResult(latestClose, null, null, null, "neutral", null, "{}");

        var closes = recentCloses.OrderByDescending(c => c.Date).Take(LookbackDays).ToList();
        var low20 = closes.Min(c => c.Close);
        var high20 = closes.Max(c => c.Close);

        // Entry price: weighted average of EMA-20 and 20-day low
        decimal? entryPrice = null;
        if (indicators?.Ema20 != null)
        {
            entryPrice = (indicators.Ema20.Value * 0.6m) + (low20 * 0.4m);
        }
        else
        {
            entryPrice = low20 * 1.01m;
        }

        if (indicators?.Rsi > OverboughtRsiThreshold && entryPrice.HasValue)
        {
            entryPrice = entryPrice.Value * (1m - OverboughtDiscount);
        }

        // Target price: weighted average of EMA-50 and 20-day high
        decimal? targetPrice = null;
        if (indicators?.Ema50 != null)
        {
            targetPrice = (indicators.Ema50.Value * 0.4m) + (high20 * 0.6m);
        }
        else
        {
            targetPrice = high20 * 0.99m;
        }

        if (indicators?.Rsi < OversoldRsiThreshold && targetPrice.HasValue)
        {
            var bounceTarget = latestClose * (1m + OversoldBounce);
            if (bounceTarget > targetPrice.Value)
                targetPrice = bounceTarget;
        }

        if (entryPrice.HasValue && targetPrice.HasValue && targetPrice.Value <= entryPrice.Value)
        {
            targetPrice = entryPrice.Value * 1.05m;
        }

        // Stop loss: 3% below entry or below 20-day low, whichever is lower
        decimal? stopLoss = null;
        if (entryPrice.HasValue)
        {
            var slFromEntry = entryPrice.Value * (1m - StopLossPercent);
            var slFromLow = low20 * 0.99m;
            stopLoss = Math.Min(slFromEntry, slFromLow);
        }

        var signal = DetermineSignal(recentSignals, indicators, latestClose);
        var confidence = CalculateConfidence(closes.Count, indicators);

        var metadata = new
        {
            lookback_days = closes.Count,
            low_20d = low20,
            high_20d = high20,
            ema_20 = indicators?.Ema20,
            ema_50 = indicators?.Ema50,
            rsi = indicators?.Rsi
        };

        return new TargetResult(
            latestClose,
            entryPrice.HasValue ? Math.Round(entryPrice.Value, 6) : null,
            targetPrice.HasValue ? Math.Round(targetPrice.Value, 6) : null,
            stopLoss.HasValue ? Math.Round(stopLoss.Value, 6) : null,
            signal,
            confidence,
            JsonSerializer.Serialize(metadata)
        );
    }

    private const decimal TrendWeight = 0.40m;
    private const decimal MomentumWeight = 0.30m;
    private const decimal PatternWeight = 0.30m;
    private const decimal BullishThreshold = 0.20m;
    private const decimal BearishThreshold = -0.20m;

    private static string DetermineSignal(
        IReadOnlyList<CandleSignal> signals,
        IndicatorSnapshot? indicators,
        decimal latestClose)
    {
        var trendScore = ScoreTrend(indicators, latestClose);
        var momentumScore = ScoreMomentum(indicators?.Rsi);
        var patternScore = ScorePatterns(signals);

        var composite = (trendScore * TrendWeight)
                      + (momentumScore * MomentumWeight)
                      + (patternScore * PatternWeight);

        if (composite > BullishThreshold) return "bullish";
        if (composite < BearishThreshold) return "bearish";
        return "neutral";
    }

    private static decimal ScoreTrend(IndicatorSnapshot? indicators, decimal latestClose)
    {
        if (indicators?.Ema20 == null || indicators.Ema50 == null)
            return 0m;

        var ema20 = indicators.Ema20.Value;
        var ema50 = indicators.Ema50.Value;
        var score = ema20 > ema50 ? 1.0m : -1.0m;

        if (latestClose > ema20 && latestClose > ema50)
            score += 0.5m;
        else if (latestClose < ema20 && latestClose < ema50)
            score -= 0.5m;

        return Math.Clamp(score, -1.5m, 1.5m);
    }

    private static decimal ScoreMomentum(decimal? rsi)
    {
        if (!rsi.HasValue) return 0m;
        var r = rsi.Value;

        if (r > OverboughtRsiThreshold) return -1.0m;
        if (r < OversoldRsiThreshold) return 1.0m;
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

    private static decimal CalculateConfidence(int dataPoints, IndicatorSnapshot? indicators)
    {
        var score = 0m;

        score += Math.Min(dataPoints / 20m, 1m) * 0.4m;

        if (indicators != null)
        {
            if (indicators.Ema20.HasValue) score += 0.2m;
            if (indicators.Ema50.HasValue) score += 0.2m;
            if (indicators.Rsi.HasValue) score += 0.2m;
        }

        return Math.Round(score, 4);
    }
}
