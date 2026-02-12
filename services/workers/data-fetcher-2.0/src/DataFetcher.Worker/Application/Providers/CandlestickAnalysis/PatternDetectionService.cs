using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Service for detecting single-candle patterns.
/// Implements 8 patterns: Doji, Long-Legged Doji, Hammer, Inverted Hammer,
/// Shooting Star, Bullish Marubozu, Bearish Marubozu, Spinning Top.
/// </summary>
public class PatternDetectionService : IPatternDetectionService
{
    private readonly ILogger<PatternDetectionService> _logger;

    // Thresholds for pattern detection
    private const double DojiBodyRatio = 0.1;       // Body < 10% of range = Doji
    private const double WickToBodyRatio = 2.0;     // Wick >= 2x body
    private const double SmallWickRatio = 0.5;      // Small wick < 50% of body
    private const double MarubozuWickRatio = 0.05;  // Minimal wick < 5% of range
    private const double SpinningTopBodyRatio = 0.3; // Body < 30% of range

    public PatternDetectionService(ILogger<PatternDetectionService> logger)
    {
        _logger = logger;
    }

    public List<CandlestickPattern> DetectPatterns(DailyCandle candle)
    {
        var patterns = new List<CandlestickPattern>();

        // Skip if range is zero (no price movement)
        if (candle.RangeSize == 0)
        {
            _logger.LogDebug("Skipping pattern detection for {Symbol} - zero range", candle.Symbol);
            return patterns;
        }

        // Calculate ratios
        var bodyRatio = (double)(candle.BodySize / candle.RangeSize);
        var upperWickRatio = candle.BodySize > 0 ? (double)(candle.UpperWick / candle.BodySize) : double.MaxValue;
        var lowerWickRatio = candle.BodySize > 0 ? (double)(candle.LowerWick / candle.BodySize) : double.MaxValue;
        var upperWickToRange = (double)(candle.UpperWick / candle.RangeSize);
        var lowerWickToRange = (double)(candle.LowerWick / candle.RangeSize);

        // 1. Doji patterns (body < 10% of range)
        if (bodyRatio < DojiBodyRatio)
        {
            if (upperWickRatio >= WickToBodyRatio && lowerWickRatio >= WickToBodyRatio)
            {
                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.LongLeggedDoji,
                    Confidence = CalculateConfidence(bodyRatio, DojiBodyRatio, inverse: true),
                    Signal = PatternSignal.Indecision,
                    Description = "Open and close nearly equal with long shadows on both sides"
                });
            }
            else
            {
                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.Doji,
                    Confidence = CalculateConfidence(bodyRatio, DojiBodyRatio, inverse: true),
                    Signal = PatternSignal.Indecision,
                    Description = "Open and close nearly equal, indicates market indecision"
                });
            }
        }

        // 2. Hammer (small body at top, long lower wick, small upper wick)
        if (bodyRatio < SpinningTopBodyRatio &&
            lowerWickRatio >= WickToBodyRatio &&
            upperWickRatio < SmallWickRatio)
        {
            var bodyPosition = GetBodyPosition(candle);
            if (bodyPosition > 0.6)
            {
                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.Hammer,
                    Confidence = CalculateHammerConfidence(lowerWickRatio, upperWickRatio, bodyPosition),
                    Signal = PatternSignal.BullishReversal,
                    Description = "Small body at top with long lower shadow, bullish reversal signal"
                });
            }
        }

        // 3. Inverted Hammer / Shooting Star
        if (bodyRatio < SpinningTopBodyRatio &&
            upperWickRatio >= WickToBodyRatio &&
            lowerWickRatio < SmallWickRatio)
        {
            var bodyPosition = GetBodyPosition(candle);
            if (bodyPosition < 0.4)
            {
                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.InvertedHammer,
                    Confidence = CalculateHammerConfidence(upperWickRatio, lowerWickRatio, 1 - bodyPosition),
                    Signal = PatternSignal.BullishReversal,
                    Description = "Small body at bottom with long upper shadow, potential bullish reversal"
                });

                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.ShootingStar,
                    Confidence = CalculateHammerConfidence(upperWickRatio, lowerWickRatio, 1 - bodyPosition) * 0.9,
                    Signal = PatternSignal.BearishReversal,
                    Description = "Small body at bottom with long upper shadow, potential bearish reversal"
                });
            }
        }

        // 4. Marubozu (no or minimal wicks)
        if (upperWickToRange < MarubozuWickRatio && lowerWickToRange < MarubozuWickRatio)
        {
            if (candle.IsBullish)
            {
                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.BullishMarubozu,
                    Confidence = CalculateMarubozuConfidence(upperWickToRange, lowerWickToRange),
                    Signal = PatternSignal.StrongBullish,
                    Description = "Strong bullish candle with no shadows, buyers in control"
                });
            }
            else
            {
                patterns.Add(new CandlestickPattern
                {
                    Pattern = PatternName.BearishMarubozu,
                    Confidence = CalculateMarubozuConfidence(upperWickToRange, lowerWickToRange),
                    Signal = PatternSignal.StrongBearish,
                    Description = "Strong bearish candle with no shadows, sellers in control"
                });
            }
        }

        // 5. Spinning Top
        if (bodyRatio < SpinningTopBodyRatio &&
            upperWickRatio >= 1.0 && lowerWickRatio >= 1.0 &&
            !patterns.Any(p => p.Pattern.Contains("doji")))
        {
            patterns.Add(new CandlestickPattern
            {
                Pattern = PatternName.SpinningTop,
                Confidence = CalculateSpinningTopConfidence(bodyRatio, upperWickRatio, lowerWickRatio),
                Signal = PatternSignal.Indecision,
                Description = "Small body with shadows on both sides, indicates indecision"
            });
        }

        _logger.LogDebug("Detected {Count} patterns for {Symbol}: {Patterns}",
            patterns.Count, candle.Symbol, string.Join(", ", patterns.Select(p => p.Pattern)));

        return patterns;
    }

    private static double GetBodyPosition(DailyCandle candle)
    {
        if (candle.RangeSize == 0) return 0.5;
        var bodyBottom = Math.Min(candle.Open, candle.Close);
        return (double)((bodyBottom - candle.Low) / candle.RangeSize);
    }

    private static double CalculateConfidence(double actual, double threshold, bool inverse = false)
    {
        if (inverse)
        {
            return Math.Min(1.0, Math.Max(0.5, 1.0 - (actual / threshold)));
        }
        return Math.Min(1.0, Math.Max(0.5, actual / threshold / 2));
    }

    private static double CalculateHammerConfidence(double longWickRatio, double shortWickRatio, double bodyPosition)
    {
        var wickScore = Math.Min(1.0, longWickRatio / 4.0);
        var shortWickScore = Math.Max(0.5, 1.0 - shortWickRatio);
        var positionScore = Math.Abs(bodyPosition - 0.5) * 2;

        return Math.Min(0.95, (wickScore + shortWickScore + positionScore) / 3);
    }

    private static double CalculateMarubozuConfidence(double upperWickRatio, double lowerWickRatio)
    {
        var avgWickRatio = (upperWickRatio + lowerWickRatio) / 2;
        return Math.Min(0.95, Math.Max(0.7, 1.0 - (avgWickRatio * 10)));
    }

    private static double CalculateSpinningTopConfidence(double bodyRatio, double upperWickRatio, double lowerWickRatio)
    {
        var bodyScore = Math.Max(0.5, 1.0 - (bodyRatio / SpinningTopBodyRatio));
        var wickBalance = 1.0 - Math.Abs(upperWickRatio - lowerWickRatio) / Math.Max(upperWickRatio, lowerWickRatio);

        return Math.Min(0.9, (bodyScore + wickBalance) / 2);
    }
}
