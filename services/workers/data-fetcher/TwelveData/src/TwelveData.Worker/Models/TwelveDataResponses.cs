using System.Text.Json.Serialization;

namespace TwelveData.Worker.Models;

/// <summary>
/// Response from the Twelve Data time_series API endpoint
/// </summary>
public class TimeSeriesResponse
{
    [JsonPropertyName("meta")]
    public TimeSeriesMeta? Meta { get; set; }
    
    [JsonPropertyName("values")]
    public List<TimeSeriesValue>? Values { get; set; }
    
    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
    
    [JsonPropertyName("message")]
    public string? Message { get; set; }
    
    [JsonPropertyName("code")]
    public int? Code { get; set; }
}

/// <summary>
/// Metadata from the time_series response
/// </summary>
public class TimeSeriesMeta
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;
    
    [JsonPropertyName("interval")]
    public string Interval { get; set; } = string.Empty;
    
    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;
    
    [JsonPropertyName("exchange_timezone")]
    public string ExchangeTimezone { get; set; } = string.Empty;
    
    [JsonPropertyName("exchange")]
    public string Exchange { get; set; } = string.Empty;
    
    [JsonPropertyName("mic_code")]
    public string MicCode { get; set; } = string.Empty;
    
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;
}

/// <summary>
/// Individual OHLCV data point from the time_series response
/// </summary>
public class TimeSeriesValue
{
    [JsonPropertyName("datetime")]
    public string Datetime { get; set; } = string.Empty;
    
    [JsonPropertyName("open")]
    public string Open { get; set; } = "0";
    
    [JsonPropertyName("high")]
    public string High { get; set; } = "0";
    
    [JsonPropertyName("low")]
    public string Low { get; set; } = "0";
    
    [JsonPropertyName("close")]
    public string Close { get; set; } = "0";
    
    [JsonPropertyName("volume")]
    public string Volume { get; set; } = "0";
}

