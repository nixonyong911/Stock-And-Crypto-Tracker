using System.Text.Json.Serialization;

namespace AlphaVantage.Worker.Models;

public class GlobalQuoteResponse
{
    [JsonPropertyName("Global Quote")]
    public GlobalQuoteData? GlobalQuote { get; set; }
}

public class GlobalQuoteData
{
    [JsonPropertyName("01. symbol")]
    public string Symbol { get; set; } = string.Empty;
    
    [JsonPropertyName("02. open")]
    public string Open { get; set; } = "0";
    
    [JsonPropertyName("03. high")]
    public string High { get; set; } = "0";
    
    [JsonPropertyName("04. low")]
    public string Low { get; set; } = "0";
    
    [JsonPropertyName("05. price")]
    public string Price { get; set; } = "0";
    
    [JsonPropertyName("06. volume")]
    public string Volume { get; set; } = "0";
    
    [JsonPropertyName("07. latest trading day")]
    public string LatestTradingDay { get; set; } = string.Empty;
    
    [JsonPropertyName("08. previous close")]
    public string PreviousClose { get; set; } = "0";
    
    [JsonPropertyName("09. change")]
    public string Change { get; set; } = "0";
    
    [JsonPropertyName("10. change percent")]
    public string ChangePercent { get; set; } = "0%";
}

public class TimeSeriesDailyResponse
{
    [JsonPropertyName("Meta Data")]
    public TimeSeriesMetaData? MetaData { get; set; }
    
    [JsonPropertyName("Time Series (Daily)")]
    public Dictionary<string, TimeSeriesDailyData>? TimeSeries { get; set; }
}

public class TimeSeriesMetaData
{
    [JsonPropertyName("1. Information")]
    public string Information { get; set; } = string.Empty;
    
    [JsonPropertyName("2. Symbol")]
    public string Symbol { get; set; } = string.Empty;
    
    [JsonPropertyName("3. Last Refreshed")]
    public string LastRefreshed { get; set; } = string.Empty;
    
    [JsonPropertyName("4. Output Size")]
    public string OutputSize { get; set; } = string.Empty;
    
    [JsonPropertyName("5. Time Zone")]
    public string TimeZone { get; set; } = string.Empty;
}

public class TimeSeriesDailyData
{
    [JsonPropertyName("1. open")]
    public string Open { get; set; } = "0";
    
    [JsonPropertyName("2. high")]
    public string High { get; set; } = "0";
    
    [JsonPropertyName("3. low")]
    public string Low { get; set; } = "0";
    
    [JsonPropertyName("4. close")]
    public string Close { get; set; } = "0";
    
    [JsonPropertyName("5. volume")]
    public string Volume { get; set; } = "0";
}

