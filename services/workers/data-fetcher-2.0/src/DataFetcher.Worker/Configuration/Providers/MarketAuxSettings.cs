namespace DataFetcher.Worker.Configuration.Providers;

public class MarketAuxSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.marketaux.com/v1";
    public int DailyRequestBudget { get; set; } = 80;
}
