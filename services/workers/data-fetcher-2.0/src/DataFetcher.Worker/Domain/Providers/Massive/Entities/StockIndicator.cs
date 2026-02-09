namespace DataFetcher.Worker.Domain.Providers.Massive.Entities;

/// <summary>
/// Technical indicator data for a stock ticker.
/// Maps to analysis_stock_indicator table.
/// </summary>
public class StockIndicator
{
    /// <summary>
    /// Primary key.
    /// </summary>
    public long Id { get; set; }

    /// <summary>
    /// Foreign key to the stock_tickers table.
    /// </summary>
    public int StockTickerId { get; set; }

    /// <summary>
    /// Foreign key to the data_sources table.
    /// </summary>
    public int DataSourceId { get; set; }

    /// <summary>
    /// Timestamp of the indicator data point.
    /// </summary>
    public DateTime IndicatorTime { get; set; }

    /// <summary>
    /// Simple Moving Average value.
    /// </summary>
    public decimal? Sma { get; set; }

    /// <summary>
    /// Exponential Moving Average value.
    /// </summary>
    public decimal? Ema { get; set; }

    /// <summary>
    /// MACD line value (difference between short and long EMA).
    /// </summary>
    public decimal? MacdValue { get; set; }

    /// <summary>
    /// MACD signal line value.
    /// </summary>
    public decimal? MacdSignal { get; set; }

    /// <summary>
    /// MACD histogram value (MACD line minus signal line).
    /// </summary>
    public decimal? MacdHistogram { get; set; }

    /// <summary>
    /// Relative Strength Index value.
    /// </summary>
    public decimal? Rsi { get; set; }

    /// <summary>
    /// Timestamp when the record was created.
    /// </summary>
    public DateTime CreatedAt { get; set; }
}
