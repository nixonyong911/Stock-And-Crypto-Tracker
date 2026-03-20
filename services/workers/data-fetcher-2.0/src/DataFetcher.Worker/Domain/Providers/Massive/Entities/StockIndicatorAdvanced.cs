namespace DataFetcher.Worker.Domain.Providers.Massive.Entities;

/// <summary>
/// Advanced technical indicator data for a stock ticker.
/// Maps to analysis_indicators_stock_pro table.
/// Includes Bollinger Bands, ATR, Stochastic, ADX, OBV, Fibonacci, Pivot Points, and Ichimoku Cloud.
/// </summary>
public class StockIndicatorAdvanced
{
    public long Id { get; set; }
    public int StockTickerId { get; set; }
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

    // External Indicators (Finnhub — daily)
    public int? InsiderBuyCount { get; set; }
    public int? InsiderSellCount { get; set; }
    public long? InsiderNetShares { get; set; }
    public decimal? InsiderNetValue { get; set; }
    public decimal? InsiderMspr { get; set; }
    public long? InsiderMsprChange { get; set; }
    public int? AnalystStrongBuy { get; set; }
    public int? AnalystBuy { get; set; }
    public int? AnalystHold { get; set; }
    public int? AnalystSell { get; set; }
    public int? AnalystStrongSell { get; set; }
    public string? AnalystConsensus { get; set; }

    public DateTime CreatedAt { get; set; }
}
