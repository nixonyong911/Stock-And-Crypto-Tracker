namespace DataFetcher.Worker.Configuration;

public class GatewaySettings
{
    public string BaseUrl { get; set; } = "http://gateway-2.0:8080";
    public string InternalServiceKey { get; set; } = string.Empty;
}
