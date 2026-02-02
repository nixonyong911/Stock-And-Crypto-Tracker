namespace Finnhub.Worker.Configuration;

/// <summary>
/// Database connection settings.
/// </summary>
public class DatabaseSettings
{
    /// <summary>
    /// The default database connection string.
    /// </summary>
    public string DefaultConnection { get; set; } = string.Empty;
}
