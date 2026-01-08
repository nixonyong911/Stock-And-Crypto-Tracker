using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace StockTracker.Common.Supabase;

/// <summary>
/// Factory for creating and managing Supabase client instances
/// Uses lazy initialization to create clients on first use
/// </summary>
public class SupabaseClientFactory : ISupabaseClientFactory
{
    private readonly SupabaseSettings _settings;
    private readonly ILogger<SupabaseClientFactory> _logger;
    private readonly Lazy<global::Supabase.Client> _anonClient;
    private readonly Lazy<global::Supabase.Client> _serviceClient;

    public SupabaseClientFactory(
        IOptions<SupabaseSettings> settings,
        ILogger<SupabaseClientFactory> logger)
    {
        _settings = settings.Value;
        _logger = logger;
        
        ValidateSettings();
        
        _anonClient = new Lazy<global::Supabase.Client>(() => 
            InitializeClient(_settings.AnonKey, "anon"));
        _serviceClient = new Lazy<global::Supabase.Client>(() => 
            InitializeClient(_settings.ServiceRoleKey, "service_role"));
    }

    public string ProjectUrl => _settings.Url;

    public global::Supabase.Client CreateClient(bool useServiceRole = true)
    {
        return useServiceRole ? _serviceClient.Value : _anonClient.Value;
    }

    private void ValidateSettings()
    {
        if (string.IsNullOrWhiteSpace(_settings.Url))
        {
            throw new InvalidOperationException("Supabase URL is not configured. Set Supabase:Url in configuration.");
        }

        if (string.IsNullOrWhiteSpace(_settings.ServiceRoleKey))
        {
            _logger.LogWarning("Supabase ServiceRoleKey is not configured. Service role client will not be available.");
        }

        if (string.IsNullOrWhiteSpace(_settings.AnonKey))
        {
            _logger.LogWarning("Supabase AnonKey is not configured. Anonymous client will not be available.");
        }
    }

    private global::Supabase.Client InitializeClient(string key, string keyType)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException($"Supabase {keyType} key is not configured.");
        }

        _logger.LogInformation("Initializing Supabase client with {KeyType} key for {Url}", keyType, _settings.Url);
        
        var options = new global::Supabase.SupabaseOptions
        {
            AutoConnectRealtime = false, // Enable only if needed
            AutoRefreshToken = true
        };

        var client = new global::Supabase.Client(_settings.Url, key, options);
        
        // Initialize synchronously (required for lazy initialization)
        client.InitializeAsync().GetAwaiter().GetResult();
        
        _logger.LogInformation("Supabase client initialized successfully with {KeyType} key", keyType);
        
        return client;
    }
}



































