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
    public double? Volume { get; set; }
}

public class EtoroSocialSearchResponse
{
    [JsonPropertyName("page")] public int Page { get; set; }
    [JsonPropertyName("pageSize")] public int PageSize { get; set; }
    [JsonPropertyName("totalItems")] public int TotalItems { get; set; }
    [JsonPropertyName("items")] public List<EtoroSocialInstrument> Items { get; set; } = [];
}

public class EtoroSocialInstrument
{
    [JsonPropertyName("instrumentId")] public int InstrumentId { get; set; }
    [JsonPropertyName("displayname")] public string? DisplayName { get; set; }
    [JsonPropertyName("internalSymbolFull")] public string? InternalSymbol { get; set; }
    [JsonPropertyName("symbol")] public string? Symbol { get; set; }
    [JsonPropertyName("instrumentTypeID")] public int? InstrumentTypeId { get; set; }
    [JsonPropertyName("instrumentType")] public string? InstrumentType { get; set; }
    [JsonPropertyName("holdingPct")] public double? HoldingPct { get; set; }
    [JsonPropertyName("buyHoldingPct")] public double? BuyHoldingPct { get; set; }
    [JsonPropertyName("sellHoldingPct")] public double? SellHoldingPct { get; set; }
    [JsonPropertyName("buyPctChange24Hours")] public double? BuyPctChange24Hours { get; set; }
    [JsonPropertyName("traders7DayChange")] public double? Traders7DayChange { get; set; }
    [JsonPropertyName("traders30DayChange")] public double? Traders30DayChange { get; set; }
    [JsonPropertyName("popularityUniques7Day")] public int? PopularityUniques7Day { get; set; }
    [JsonPropertyName("dailyPriceChange")] public double? DailyPriceChange { get; set; }
    [JsonPropertyName("weeklyPriceChange")] public double? WeeklyPriceChange { get; set; }
    [JsonPropertyName("monthlyPriceChange")] public double? MonthlyPriceChange { get; set; }
    [JsonPropertyName("currentRate")] public double? CurrentRate { get; set; }
}

public class EtoroCuratedListsResponse
{
    [JsonPropertyName("curatedLists")] public List<EtoroCuratedList> CuratedLists { get; set; } = [];
}

public class EtoroCuratedList
{
    [JsonPropertyName("uuid")] public string? Uuid { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("items")] public List<EtoroCuratedListItem> Items { get; set; } = [];
}

public class EtoroCuratedListItem
{
    [JsonPropertyName("instrumentId")] public int InstrumentId { get; set; }
}

public class EtoroInvestorSearchResponse
{
    [JsonPropertyName("totalItems")] public int TotalItems { get; set; }
    [JsonPropertyName("items")] public List<EtoroInvestor> Items { get; set; } = [];
}

public class EtoroInvestor
{
    [JsonPropertyName("userName")] public string UserName { get; set; } = string.Empty;
    [JsonPropertyName("fullName")] public string? FullName { get; set; }
    [JsonPropertyName("copiers")] public int Copiers { get; set; }
    [JsonPropertyName("gain")] public double Gain { get; set; }
    [JsonPropertyName("winRatio")] public double WinRatio { get; set; }
    [JsonPropertyName("riskScore")] public int RiskScore { get; set; }
    [JsonPropertyName("trades")] public int Trades { get; set; }
    [JsonPropertyName("isPopularInvestor")] public bool IsPopularInvestor { get; set; }
    [JsonPropertyName("topTradedInstrumentId")] public int? TopTradedInstrumentId { get; set; }
}

public class EtoroUserPortfolioResponse
{
    [JsonPropertyName("positions")] public List<EtoroPosition> Positions { get; set; } = [];
}

public class EtoroPosition
{
    [JsonPropertyName("instrumentId")] public int InstrumentId { get; set; }
    [JsonPropertyName("isBuy")] public bool IsBuy { get; set; }
    [JsonPropertyName("investmentPct")] public double InvestmentPct { get; set; }
    [JsonPropertyName("netProfit")] public double NetProfit { get; set; }
    [JsonPropertyName("openRate")] public double OpenRate { get; set; }
    [JsonPropertyName("leverage")] public int Leverage { get; set; }
}

public class EtoroInstrumentsMetadataResponse
{
    [JsonPropertyName("instrumentDisplayDatas")]
    public List<EtoroInstrumentMetadata> Items { get; set; } = [];
}

public class EtoroInstrumentMetadata
{
    [JsonPropertyName("instrumentID")] public int InstrumentId { get; set; }
    [JsonPropertyName("instrumentDisplayName")] public string? DisplayName { get; set; }
    [JsonPropertyName("instrumentTypeID")] public int? InstrumentTypeId { get; set; }
    [JsonPropertyName("symbolFull")] public string? SymbolFull { get; set; }
    [JsonPropertyName("exchangeID")] public int? ExchangeId { get; set; }
}
