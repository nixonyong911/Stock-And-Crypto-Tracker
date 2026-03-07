namespace DataFetcher.Worker.Domain.Providers.Alpaca.Models;

using System.Text.Json.Serialization;

public class AlpacaAssetResponse
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("class")]
    public string AssetClass { get; set; } = string.Empty;

    [JsonPropertyName("exchange")]
    public string Exchange { get; set; } = string.Empty;

    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("tradable")]
    public bool Tradable { get; set; }

    [JsonPropertyName("fractionable")]
    public bool Fractionable { get; set; }
}
