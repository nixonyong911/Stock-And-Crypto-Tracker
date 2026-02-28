namespace DataFetcher.Worker.Domain.Providers.Massive.Entities;

/// <summary>
/// Technical indicator data for a crypto ticker.
/// Maps to analysis_crypto_indicator table.
/// </summary>
public class CryptoIndicator
{
    public long Id { get; set; }
    public int CryptoTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime IndicatorTime { get; set; }
    public decimal? Sma { get; set; }
    public decimal? Ema { get; set; }
    public decimal? MacdValue { get; set; }
    public decimal? MacdSignal { get; set; }
    public decimal? MacdHistogram { get; set; }
    public decimal? Rsi { get; set; }
    public DateTime CreatedAt { get; set; }
}
