namespace TwelveData.Worker.Models;

/// <summary>
/// Represents a data source from the data_sources table
/// </summary>
public class DataSource
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? BaseUrl { get; set; }
    public bool SupportsStocks { get; set; }
    public bool SupportsCrypto { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

