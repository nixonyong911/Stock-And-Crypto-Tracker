using System.Text.Json.Serialization;

namespace DataFetcher.Worker.Domain.Providers.Etoro.Models;

public class EtoroSearchResponse
{
    [JsonPropertyName("items")]
    public List<EtoroInstrument> Items { get; set; } = [];

    [JsonPropertyName("totalItems")]
    public int TotalItems { get; set; }
}

public class EtoroInstrument
{
    [JsonPropertyName("instrumentId")]
    public int InstrumentId { get; set; }

    [JsonPropertyName("symbolFull")]
    public string SymbolFull { get; set; } = string.Empty;

    [JsonPropertyName("internalSymbolFull")]
    public string InternalSymbolFull { get; set; } = string.Empty;

    [JsonPropertyName("instrumentDisplayName")]
    public string InstrumentDisplayName { get; set; } = string.Empty;

    [JsonPropertyName("internalAssetClassName")]
    public string InternalAssetClassName { get; set; } = string.Empty;

    [JsonPropertyName("instrumentTypeId")]
    public int? InstrumentTypeId { get; set; }

    [JsonPropertyName("isActive")]
    public bool? IsActive { get; set; }

    [JsonPropertyName("isTradable")]
    public bool? IsTradable { get; set; }
}

public class EtoroCandlesResponse
{
    [JsonPropertyName("interval")]
    public string? Interval { get; set; }

    [JsonPropertyName("candles")]
    public List<EtoroCandleGroup> CandleGroups { get; set; } = [];
}

public class EtoroCandleGroup
{
    [JsonPropertyName("instrumentId")]
    public int InstrumentId { get; set; }

    [JsonPropertyName("candles")]
    public List<EtoroCandle> Candles { get; set; } = [];
}

public class EtoroCandle
{
    [JsonPropertyName("fromDate")]
    public DateTime FromDate { get; set; }

    [JsonPropertyName("open")]
    public double Open { get; set; }

    [JsonPropertyName("high")]
    public double High { get; set; }

    [JsonPropertyName("low")]
    public double Low { get; set; }

    [JsonPropertyName("close")]
    public double Close { get; set; }

    [JsonPropertyName("volume")]
    public double Volume { get; set; }
}
