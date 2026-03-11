using System.Text.Json.Serialization;

namespace DataFetcher.Worker.Application.Providers.MarketAuxNews;

public class MarketAuxResponse
{
    [JsonPropertyName("meta")]
    public MarketAuxMeta Meta { get; set; } = new();

    [JsonPropertyName("data")]
    public List<MarketAuxArticle> Data { get; set; } = new();
}

public class MarketAuxMeta
{
    [JsonPropertyName("found")]
    public int Found { get; set; }

    [JsonPropertyName("returned")]
    public int Returned { get; set; }

    [JsonPropertyName("limit")]
    public int Limit { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }
}

public class MarketAuxArticle
{
    [JsonPropertyName("uuid")]
    public string Uuid { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("snippet")]
    public string? Snippet { get; set; }

    [JsonPropertyName("keywords")]
    public string? Keywords { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("image_url")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("language")]
    public string Language { get; set; } = "en";

    [JsonPropertyName("published_at")]
    public DateTime PublishedAt { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;

    [JsonPropertyName("relevance_score")]
    public double? RelevanceScore { get; set; }

    [JsonPropertyName("entities")]
    public List<MarketAuxEntity> Entities { get; set; } = new();
}

public class MarketAuxEntity
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("exchange")]
    public string? Exchange { get; set; }

    [JsonPropertyName("exchange_long")]
    public string? ExchangeLong { get; set; }

    [JsonPropertyName("country")]
    public string? Country { get; set; }

    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("industry")]
    public string? Industry { get; set; }

    [JsonPropertyName("match_score")]
    public double MatchScore { get; set; }

    [JsonPropertyName("sentiment_score")]
    public double SentimentScore { get; set; }

    [JsonPropertyName("highlights")]
    public List<MarketAuxHighlight>? Highlights { get; set; }
}

public class MarketAuxHighlight
{
    [JsonPropertyName("highlight")]
    public string? Text { get; set; }

    [JsonPropertyName("sentiment")]
    public double Sentiment { get; set; }

    [JsonPropertyName("highlighted_in")]
    public string? HighlightedIn { get; set; }
}

public class CompactEntity
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("sentiment_score")]
    public double SentimentScore { get; set; }

    [JsonPropertyName("match_score")]
    public double MatchScore { get; set; }
}
