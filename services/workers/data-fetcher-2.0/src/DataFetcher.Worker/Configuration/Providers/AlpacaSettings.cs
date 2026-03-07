namespace DataFetcher.Worker.Configuration.Providers;

public class AlpacaSettings
{
    public string ApiKeyId { get; set; } = string.Empty;
    public string ApiSecretKey { get; set; } = string.Empty;
    public string MarketDataBaseUrl { get; set; } = "https://data.alpaca.markets";
    public string TradingApiBaseUrl { get; set; } = "https://api.alpaca.markets";
    public int MonthsToBackfill { get; set; } = 6;
    public int MaxBarsPerRequest { get; set; } = 10000;
    public string StockTimeframe { get; set; } = "15Min";
    public string CryptoTimeframe { get; set; } = "15Min";
    public string StockFeed { get; set; } = "sip";
    public string StockAdjustment { get; set; } = "split";
    public string CryptoLoc { get; set; } = "us";
    public int FetchIntervalMinutes { get; set; } = 30;
    public int RateLimitThreshold { get; set; } = 10;
}
