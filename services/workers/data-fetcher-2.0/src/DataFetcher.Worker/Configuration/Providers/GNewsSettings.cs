namespace DataFetcher.Worker.Configuration.Providers;

public class GNewsSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://gnews.io/api/v4";
    public int DailyRequestBudget { get; set; } = 90;
}
