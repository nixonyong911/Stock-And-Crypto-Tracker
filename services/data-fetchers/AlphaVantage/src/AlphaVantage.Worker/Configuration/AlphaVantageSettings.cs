namespace AlphaVantage.Worker.Configuration;

public class AlphaVantageSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://www.alphavantage.co";
    public int FetchIntervalMinutes { get; set; } = 60;
    public string[] Symbols { get; set; } = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"];
}

