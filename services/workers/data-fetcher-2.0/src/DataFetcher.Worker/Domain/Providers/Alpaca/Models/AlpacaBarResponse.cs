namespace DataFetcher.Worker.Domain.Providers.Alpaca.Models;

using System.Text.Json.Serialization;

public class AlpacaBarResponse
{
    [JsonPropertyName("bars")]
    public Dictionary<string, List<AlpacaBar>>? Bars { get; set; }

    [JsonPropertyName("next_page_token")]
    public string? NextPageToken { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }
}
