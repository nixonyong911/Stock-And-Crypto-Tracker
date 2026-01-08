namespace CandlestickAnalysis.Worker.Models;

/// <summary>
/// Raw stock price from the stock_prices table (15-minute candle).
/// </summary>
public class StockPrice
{
    public long Id { get; set; }
    public int StockTickerId { get; set; }
    public int DataSourceId { get; set; }
    public DateTime PriceTime { get; set; }
    public decimal OpenPrice { get; set; }
    public decimal HighPrice { get; set; }
    public decimal LowPrice { get; set; }
    public decimal ClosePrice { get; set; }
    public long Volume { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Stock ticker information.
/// </summary>
public class StockTicker
{
    public int Id { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Exchange { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>
/// Analysis schedule configuration.
/// </summary>
public class AnalysisSchedule
{
    public int Id { get; set; }
    public int DataSourceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>
    /// Time of day to run (in ScheduleTimezone)
    /// </summary>
    public TimeSpan ScheduleTime { get; set; }
    /// <summary>
    /// IANA timezone for ScheduleTime (e.g., "America/New_York")
    /// </summary>
    public string ScheduleTimezone { get; set; } = "America/New_York";
    public bool IsEnabled { get; set; }
    public string FetchConfig { get; set; } = "{}";
    public DateTime? LastRunAt { get; set; }
    public string? LastRunStatus { get; set; }
    public string? LastRunMessage { get; set; }
}

/// <summary>
/// Analysis configuration parsed from fetch_config JSONB.
/// </summary>
public class AnalysisConfig
{
    public string AnalyzeDate { get; set; } = "yesterday";
}

