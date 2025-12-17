namespace TwelveData.Worker.Configuration;

public class TwelveDataSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://api.twelvedata.com";
    public int FetchIntervalMinutes { get; set; } = 15;
    public int OutputSize { get; set; } = 96; // 24 hours of 15-min candles
    public string Interval { get; set; } = "15min";
    public string Exchange { get; set; } = "NASDAQ";
    public string Timezone { get; set; } = "America/New_York";
}

