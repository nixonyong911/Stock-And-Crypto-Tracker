namespace DataFetcher.Worker.Configuration.Providers;

public class FredSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.stlouisfed.org";
    public string ScheduleTime { get; set; } = "08:00";
    public string ScheduleTimezone { get; set; } = "America/New_York";
}
