namespace DataFetcher.Worker.Domain.Providers.MarketAuxNews.Entities;

public class NewsArticle
{
    public long Id { get; set; }
    public string MarketauxUuid { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Snippet { get; set; }
    public string? Keywords { get; set; }
    public string Url { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public DateTime PublishedAt { get; set; }
    public string Language { get; set; } = "en";
    public string Entities { get; set; } = "[]";
    public decimal? AvgSentimentScore { get; set; }
    public string? SentimentLabel { get; set; }
    public int EntityCount { get; set; }
    public string? SearchCategory { get; set; }
    public DateTime CreatedAt { get; set; }
}
