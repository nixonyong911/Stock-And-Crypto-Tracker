using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Services.RateLimiting;

namespace TwelveData.Worker.Services.Verification;

/// <summary>
/// Verifies cryptocurrency symbols against Twelve Data /cryptocurrencies endpoint
/// </summary>
public class CryptoVerifier : IAssetVerifier
{
    private readonly HttpClient _httpClient;
    private readonly TwelveDataSettings _settings;
    private readonly ITwelveDataRateLimiter _rateLimiter;
    private readonly ILogger<CryptoVerifier> _logger;

    public AssetType AssetType => AssetType.Crypto;

    public CryptoVerifier(
        HttpClient httpClient,
        IOptions<TwelveDataSettings> settings,
        ITwelveDataRateLimiter rateLimiter,
        ILogger<CryptoVerifier> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _rateLimiter = rateLimiter;
        _logger = logger;
        
        _httpClient.BaseAddress = new Uri(_settings.BaseUrl);
    }

    public async Task<VerificationResult> VerifyAsync(string symbol, CancellationToken cancellationToken = default)
    {
        // Normalize symbol: btc -> BTC/USD, eth -> ETH/USD
        symbol = NormalizeCryptoSymbol(symbol);

        try
        {
            // Acquire rate limit slot (external caller)
            var rateLimitResult = await _rateLimiter.AcquireAsync("external", cancellationToken);
            
            if (rateLimitResult.Status == RateLimitStatus.Queued)
            {
                return VerificationResult.Error(AssetType, symbol, "Daily rate limit reached. Please try again tomorrow.");
            }
            
            if (rateLimitResult.Status == RateLimitStatus.Failed)
            {
                return VerificationResult.Error(AssetType, symbol, rateLimitResult.ErrorMessage ?? "Rate limit check failed");
            }

            // Call Twelve Data /cryptocurrencies endpoint with symbol filter
            // Symbol is already normalized to BTC/USD format
            var url = $"/cryptocurrencies?symbol={symbol}&apikey={_settings.ApiKey}";
            
            _logger.LogDebug("Verifying crypto symbol {Symbol} via Twelve Data", symbol);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Twelve Data /cryptocurrencies returned {StatusCode}: {Content}", response.StatusCode, content);
                return VerificationResult.Error(AssetType, symbol, $"API error: {response.StatusCode}");
            }
            
            var cryptoResponse = JsonSerializer.Deserialize<CryptocurrenciesResponse>(content);
            
            if (cryptoResponse?.Data == null || cryptoResponse.Data.Count == 0)
            {
                _logger.LogInformation("Crypto symbol {Symbol} not found in Twelve Data catalog", symbol);
                return VerificationResult.NotFound(AssetType, symbol);
            }
            
            // Symbol found - return first match
            var crypto = cryptoResponse.Data[0];
            
            // For crypto, use currency_quote as currency and first exchange
            var exchange = crypto.AvailableExchanges?.FirstOrDefault();
            
            _logger.LogInformation(
                "Crypto symbol {Symbol} verified: {Base}/{Quote} on {Exchange}",
                symbol, crypto.CurrencyBase, crypto.CurrencyQuote, exchange);
            
            return VerificationResult.Success(
                AssetType,
                crypto.Symbol,
                $"{crypto.CurrencyBase}/{crypto.CurrencyQuote}",  // Name as "BTC/USD"
                exchange,
                crypto.CurrencyQuote,  // Quote currency (e.g., "USD")
                null);  // Crypto has no country
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying crypto symbol {Symbol}", symbol);
            return VerificationResult.Error(AssetType, symbol, $"Verification error: {ex.Message}");
        }
    }

    /// <summary>
    /// Normalizes crypto symbol to uppercase with /USD quote currency.
    /// Examples: btc -> BTC/USD, ETH -> ETH/USD, btc/usd -> BTC/USD
    /// </summary>
    private static string NormalizeCryptoSymbol(string symbol)
    {
        symbol = symbol.ToUpperInvariant().Trim();

        // If no slash present, append /USD
        if (!symbol.Contains('/'))
        {
            symbol = $"{symbol}/USD";
        }

        return symbol;
    }
}
