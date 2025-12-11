namespace StockTracker.Data.Entities;

/// <summary>
/// Centralized 3rd party API configuration.
/// Stores connection details and encrypted credentials for data providers.
/// </summary>
public class DataSource
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    
    // Authentication
    public string AuthType { get; set; } = "api_key"; // api_key, oauth2, basic, none
    public string? ApiKeyEncrypted { get; set; }
    public string? ApiSecretEncrypted { get; set; }
    
    // Connection
    public string? BaseUrl { get; set; }
    public int? RateLimitPerMinute { get; set; }
    public int? RateLimitPerDay { get; set; }
    public int TimeoutSeconds { get; set; } = 30;
    public int RetryCount { get; set; } = 3;
    public string? CustomHeaders { get; set; } // JSONB
    
    // OAuth (if applicable)
    public string? OAuthTokenUrl { get; set; }
    public string? OAuthClientIdEncrypted { get; set; }
    public string? OAuthClientSecretEncrypted { get; set; }
    
    // Metadata
    public string Environment { get; set; } = "prod"; // prod, sandbox
    public bool SupportsStocks { get; set; }
    public bool SupportsCrypto { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public ICollection<StockPrice> StockPrices { get; set; } = new List<StockPrice>();
    public ICollection<CryptoPrice> CryptoPrices { get; set; } = new List<CryptoPrice>();
}

