namespace DataFetcher.Worker.Domain.Providers.Alpaca.Models;

using System.Text.Json.Serialization;

public class AlpacaBar
{
    [JsonPropertyName("t")]
    public DateTime Timestamp { get; set; }

    [JsonPropertyName("o")]
    public double Open { get; set; }

    [JsonPropertyName("h")]
    public double High { get; set; }

    [JsonPropertyName("l")]
    public double Low { get; set; }

    [JsonPropertyName("c")]
    public double Close { get; set; }

    [JsonPropertyName("v")]
    public double Volume { get; set; }

    [JsonPropertyName("n")]
    public long TradeCount { get; set; }

    [JsonPropertyName("vw")]
    public double Vwap { get; set; }
}
