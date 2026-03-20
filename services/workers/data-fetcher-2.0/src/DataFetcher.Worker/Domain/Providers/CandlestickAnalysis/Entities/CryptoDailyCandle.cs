namespace DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

/// <summary>
/// Daily OHLCV candle aggregated from 15-minute crypto candles.
/// Implements IDailyCandle for shared pattern detection.
/// </summary>
public class CryptoDailyCandle : IDailyCandle
{
    public int CryptoTickerId { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateOnly AnalysisDate { get; set; }

    public decimal Open { get; set; }
    public decimal High { get; set; }
    public decimal Low { get; set; }
    public decimal Close { get; set; }
    public decimal Volume { get; set; }

    public decimal BodySize => Math.Abs(Close - Open);
    public decimal RangeSize => High - Low;
    public decimal UpperWick => High - Math.Max(Open, Close);
    public decimal LowerWick => Math.Min(Open, Close) - Low;
    public bool IsBullish => Close > Open;

    public int CandlesAggregated { get; set; }

    // Multi-timeframe fields
    public string Timeframe { get; set; } = "daily";
    public bool IsConfirmed { get; set; } = true;
    public decimal Confidence { get; set; } = 1.00m;
}
