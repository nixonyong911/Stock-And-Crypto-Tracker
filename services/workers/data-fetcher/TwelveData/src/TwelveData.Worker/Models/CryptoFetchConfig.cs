using System.Text.Json.Serialization;

namespace TwelveData.Worker.Models;

/// <summary>
/// Deserialized fetch configuration for crypto from worker_fetch_schedules.fetch_config JSONB
/// </summary>
public class CryptoFetchConfig
{
    [JsonPropertyName("fetch_date")]
    public string FetchDate { get; set; } = "yesterday";
    
    [JsonPropertyName("interval")]
    public string Interval { get; set; } = "15min";
    
    [JsonPropertyName("output_size")]
    public int OutputSize { get; set; } = 96;  // 24h of 15min intervals (crypto trades 24/7)
    
    [JsonPropertyName("timezone")]
    public string Timezone { get; set; } = "UTC";  // Crypto uses UTC
    
    [JsonPropertyName("rate_limit_delay_seconds")]
    public int RateLimitDelaySeconds { get; set; } = 8;
}
