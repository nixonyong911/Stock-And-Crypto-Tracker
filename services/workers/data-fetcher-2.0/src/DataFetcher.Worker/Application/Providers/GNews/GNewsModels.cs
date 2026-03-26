using System.Text.Json.Serialization;

namespace DataFetcher.Worker.Application.Providers.GNews;

public class GNewsResponse
{
    [JsonPropertyName("totalArticles")]
    public int TotalArticles { get; set; }

    [JsonPropertyName("articles")]
    public List<GNewsArticleDto> Articles { get; set; } = new();
}

public class GNewsArticleDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("content")]
    public string? Content { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("image")]
    public string? Image { get; set; }

    [JsonPropertyName("publishedAt")]
    public DateTime PublishedAt { get; set; }

    [JsonPropertyName("lang")]
    public string Lang { get; set; } = "en";

    [JsonPropertyName("source")]
    public GNewsSourceDto Source { get; set; } = new();
}

public class GNewsSourceDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;
}
