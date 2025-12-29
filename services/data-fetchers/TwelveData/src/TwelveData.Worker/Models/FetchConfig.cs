using System.Text.Json.Serialization;

namespace TwelveData.Worker.Models;

/// <summary>
/// Deserialized fetch configuration from fetch_schedules.fetch_config JSONB
/// </summary>
public class FetchConfig
{
    [JsonPropertyName("fetch_date")]
    public string FetchDate { get; set; } = "yesterday";
    
    [JsonPropertyName("interval")]
    public string Interval { get; set; } = "15min";
    
    [JsonPropertyName("output_size")]
    public int OutputSize { get; set; } = 30;
    
    [JsonPropertyName("exchange")]
    public string Exchange { get; set; } = "NASDAQ";
    
    [JsonPropertyName("timezone")]
    public string Timezone { get; set; } = "America/New_York";
    
    [JsonPropertyName("rate_limit_delay_seconds")]
    public int RateLimitDelaySeconds { get; set; } = 8;
}












