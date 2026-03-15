namespace DataFetcher.Worker.Configuration.Providers;

public class EtoroSettings
{
    public string BaseUrl { get; set; } = "https://public-api.etoro.com";
    public string ApiKey { get; set; } = string.Empty;
    public string UserKey { get; set; } = string.Empty;
    public int ConservativeRateLimitPerMinute { get; set; } = 60;
    public int MaxCandlesPerRequest { get; set; } = 1000;
    public string DefaultCandleInterval { get; set; } = "FifteenMinutes";
    public string BackfillCandleInterval { get; set; } = "OneDay";
    public int FetchIntervalMinutes { get; set; } = 30;
}
