using System.Text.Json.Serialization;

namespace TwelveData.Worker.Models;

/// <summary>
/// Response from Twelve Data /stocks endpoint
/// </summary>
public class StocksResponse
{
    [JsonPropertyName("data")]
    public List<StockInfo>? Data { get; set; }
    
    [JsonPropertyName("count")]
    public int Count { get; set; }
    
    [JsonPropertyName("status")]
    public string? Status { get; set; }
}

public class StockInfo
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;
    
    [JsonPropertyName("name")]
    public string? Name { get; set; }
    
    [JsonPropertyName("currency")]
    public string? Currency { get; set; }
    
    [JsonPropertyName("exchange")]
    public string? Exchange { get; set; }
    
    [JsonPropertyName("mic_code")]
    public string? MicCode { get; set; }
    
    [JsonPropertyName("country")]
    public string? Country { get; set; }
    
    [JsonPropertyName("type")]
    public string? Type { get; set; }
}

/// <summary>
/// Response from Twelve Data /etf endpoint
/// </summary>
public class EtfResponse
{
    [JsonPropertyName("data")]
    public List<EtfInfo>? Data { get; set; }
    
    [JsonPropertyName("count")]
    public int Count { get; set; }
    
    [JsonPropertyName("status")]
    public string? Status { get; set; }
}

public class EtfInfo
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;
    
    [JsonPropertyName("name")]
    public string? Name { get; set; }
    
    [JsonPropertyName("currency")]
    public string? Currency { get; set; }
    
    [JsonPropertyName("exchange")]
    public string? Exchange { get; set; }
    
    [JsonPropertyName("mic_code")]
    public string? MicCode { get; set; }
    
    [JsonPropertyName("country")]
    public string? Country { get; set; }
}

/// <summary>
/// Response from Twelve Data /cryptocurrencies endpoint
/// </summary>
public class CryptocurrenciesResponse
{
    [JsonPropertyName("data")]
    public List<CryptoInfo>? Data { get; set; }
    
    [JsonPropertyName("count")]
    public int Count { get; set; }
    
    [JsonPropertyName("status")]
    public string? Status { get; set; }
}

public class CryptoInfo
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;
    
    [JsonPropertyName("available_exchanges")]
    public List<string>? AvailableExchanges { get; set; }
    
    [JsonPropertyName("currency_base")]
    public string? CurrencyBase { get; set; }
    
    [JsonPropertyName("currency_quote")]
    public string? CurrencyQuote { get; set; }
}
