namespace DataFetcher.Worker.Domain.Providers.Alpaca.Models;

using System.Text.Json.Serialization;

public class AlpacaAddTickerRequest
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("assetType")]
    public string AssetType { get; set; } = "Stock";
}

public class AlpacaAddTickerResult
{
    public string ResultCode { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ErrorCode { get; set; }
    public AlpacaTickerData? Data { get; set; }
}

public class AlpacaTickerData
{
    public int Id { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Exchange { get; set; }
}
