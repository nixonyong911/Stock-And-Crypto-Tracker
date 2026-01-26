using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Services.RateLimiting;

namespace TwelveData.Worker.Services.Verification;

/// <summary>
/// Verifies ETF symbols against Twelve Data /etf endpoint
/// </summary>
public class EtfVerifier : IAssetVerifier
{
    private readonly HttpClient _httpClient;
    private readonly TwelveDataSettings _settings;
    private readonly ITwelveDataRateLimiter _rateLimiter;
    private readonly ILogger<EtfVerifier> _logger;

    public AssetType AssetType => AssetType.Etf;

    public EtfVerifier(
        HttpClient httpClient,
        IOptions<TwelveDataSettings> settings,
        ITwelveDataRateLimiter rateLimiter,
        ILogger<EtfVerifier> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _rateLimiter = rateLimiter;
        _logger = logger;
        
        _httpClient.BaseAddress = new Uri(_settings.BaseUrl);
    }

    public async Task<VerificationResult> VerifyAsync(string symbol, CancellationToken cancellationToken = default)
    {
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

            // Call Twelve Data /etf endpoint with symbol filter
            var url = $"/etf?symbol={symbol.ToUpperInvariant()}&country=us&apikey={_settings.ApiKey}";
            
            _logger.LogDebug("Verifying ETF symbol {Symbol} via Twelve Data", symbol);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Twelve Data /etf returned {StatusCode}: {Content}", response.StatusCode, content);
                return VerificationResult.Error(AssetType, symbol, $"API error: {response.StatusCode}");
            }
            
            var etfResponse = JsonSerializer.Deserialize<EtfResponse>(content);
            
            if (etfResponse?.Data == null || etfResponse.Data.Count == 0)
            {
                _logger.LogInformation("ETF symbol {Symbol} not found in Twelve Data catalog", symbol);
                return VerificationResult.NotFound(AssetType, symbol);
            }
            
            // Symbol found - return first match
            var etf = etfResponse.Data[0];
            
            _logger.LogInformation(
                "ETF symbol {Symbol} verified: {Name} on {Exchange} ({Currency})",
                symbol, etf.Name, etf.Exchange, etf.Currency);
            
            return VerificationResult.Success(
                AssetType,
                etf.Symbol,
                etf.Name,
                etf.Exchange,
                etf.Currency,
                etf.Country);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying ETF symbol {Symbol}", symbol);
            return VerificationResult.Error(AssetType, symbol, $"Verification error: {ex.Message}");
        }
    }
}
