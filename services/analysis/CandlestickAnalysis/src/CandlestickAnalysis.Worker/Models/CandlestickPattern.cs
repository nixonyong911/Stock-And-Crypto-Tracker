using System.Text.Json.Serialization;

namespace CandlestickAnalysis.Worker.Models;

/// <summary>
/// Represents a detected candlestick pattern.
/// </summary>
public class CandlestickPattern
{
    /// <summary>
    /// Pattern name (e.g., "doji", "hammer", "marubozu_bullish").
    /// </summary>
    [JsonPropertyName("pattern")]
    public string Pattern { get; set; } = string.Empty;
    
    /// <summary>
    /// Confidence score from 0.0 to 1.0.
    /// </summary>
    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }
    
    /// <summary>
    /// Signal type (e.g., "bullish_reversal", "bearish_reversal", "indecision").
    /// </summary>
    [JsonPropertyName("signal")]
    public string Signal { get; set; } = string.Empty;
    
    /// <summary>
    /// Human-readable description of the pattern.
    /// </summary>
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;
}

/// <summary>
/// Pattern signal types.
/// </summary>
public static class PatternSignal
{
    public const string BullishReversal = "bullish_reversal";
    public const string BearishReversal = "bearish_reversal";
    public const string Indecision = "indecision";
    public const string StrongBullish = "strong_bullish";
    public const string StrongBearish = "strong_bearish";
}

/// <summary>
/// Pattern names.
/// </summary>
public static class PatternName
{
    public const string Doji = "doji";
    public const string LongLeggedDoji = "long_legged_doji";
    public const string Hammer = "hammer";
    public const string InvertedHammer = "inverted_hammer";
    public const string ShootingStar = "shooting_star";
    public const string BullishMarubozu = "marubozu_bullish";
    public const string BearishMarubozu = "marubozu_bearish";
    public const string SpinningTop = "spinning_top";
}

