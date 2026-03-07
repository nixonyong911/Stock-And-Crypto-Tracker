namespace DataFetcher.Worker.Domain.Providers.Alpaca.Entities;

public class DataSource
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? BaseUrl { get; set; }
    public bool IsActive { get; set; }
}
