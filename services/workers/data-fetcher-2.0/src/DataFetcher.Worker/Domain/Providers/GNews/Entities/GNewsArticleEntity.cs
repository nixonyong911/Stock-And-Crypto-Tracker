namespace DataFetcher.Worker.Domain.Providers.GNews.Entities;

public class GNewsArticleEntity
{
    public long Id { get; set; }
    public string GnewsId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ContentExcerpt { get; set; }
    public string Url { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public string? SourceName { get; set; }
    public string? SourceUrl { get; set; }
    public DateTime PublishedAt { get; set; }
    public string Language { get; set; } = "en";
    public string? SearchCategory { get; set; }
    public string? KeyPoints { get; set; }
    public DateTime CreatedAt { get; set; }
}
