namespace SimFin.Worker.Configuration;

/// <summary>
/// Database connection configuration.
/// </summary>
public class DatabaseSettings
{
    /// <summary>
    /// PostgreSQL connection string.
    /// </summary>
    public string DefaultConnection { get; set; } = string.Empty;
}
