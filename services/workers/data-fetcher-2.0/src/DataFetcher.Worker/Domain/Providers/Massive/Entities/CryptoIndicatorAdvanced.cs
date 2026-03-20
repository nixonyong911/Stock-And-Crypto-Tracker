namespace DataFetcher.Worker.Domain.Providers.Massive.Entities;

/// <summary>
/// Advanced technical indicator data for a crypto ticker.
/// Maps to analysis_indicators_crypto_pro table.
/// </summary>
public class CryptoIndicatorAdvanced
{
    public long Id { get; set; }
    public int CryptoTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime IndicatorTime { get; set; }

    // Volatility
    public decimal? BollingerUpper { get; set; }
    public decimal? BollingerLower { get; set; }
    public decimal? BollingerMiddle { get; set; }
    public decimal? BollingerBandwidth { get; set; }
    public decimal? Atr { get; set; }

    // Momentum
    public decimal? StochK { get; set; }
    public decimal? StochD { get; set; }

    // Trend strength
    public decimal? Adx { get; set; }

    // Volume
    public long? Obv { get; set; }

    // Key levels (serialized as JSON strings for Dapper)
    public string? FibonacciLevels { get; set; }
    public string? PivotLevels { get; set; }

    // Ichimoku Cloud
    public decimal? IchimokuTenkan { get; set; }
    public decimal? IchimokuKijun { get; set; }
    public decimal? IchimokuSenkouA { get; set; }
    public decimal? IchimokuSenkouB { get; set; }
    public decimal? IchimokuChikou { get; set; }

    public DateTime CreatedAt { get; set; }
}
