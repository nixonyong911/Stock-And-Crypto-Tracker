namespace TwelveData.Worker.Configuration;

/// <summary>
/// Configuration settings for Redis connection used by rate limiting
/// </summary>
public class RedisSettings
{
    public string ConnectionString { get; set; } = "localhost:6379";
}
