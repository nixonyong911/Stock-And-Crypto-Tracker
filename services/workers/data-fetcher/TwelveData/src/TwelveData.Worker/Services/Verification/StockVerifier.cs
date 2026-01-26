using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Services.RateLimiting;

namespace TwelveData.Worker.Services.Verification;

/// <summary>
/// Verifies stock symbols against Twelve Data /stocks endpoint
/// </summary>
public class StockVerifier : IAssetVerifier
{
    private readonly HttpClient _httpClient;
    private readonly TwelveDataSettings _settings;
    private readonly ITwelveDataRateLimiter _rateLimiter;
    private readonly ILogger<StockVerifier> _logger;

    public AssetType AssetType => AssetType.Stock;

    public StockVerifier(
        HttpClient httpClient,
        IOptions<TwelveDataSettings> settings,
        ITwelveDataRateLimiter rateLimiter,
        ILogger<StockVerifier> logger)
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

            // Call Twelve Data /stocks endpoint with symbol filter
            var url = $"/stocks?symbol={symbol.ToUpperInvariant()}&country=us&apikey={_settings.ApiKey}";

            _logger.LogDebug("Verifying stock symbol {Symbol} via Twelve Data", symbol);

            var response = await _httpClient.GetAsync(url, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Twelve Data /stocks returned {StatusCode}: {Content}", response.StatusCode, content);
                return VerificationResult.Error(AssetType, symbol, $"API error: {response.StatusCode}");
            }

            var stocksResponse = JsonSerializer.Deserialize<StocksResponse>(content);

            if (stocksResponse?.Data == null || stocksResponse.Data.Count == 0)
            {
                _logger.LogInformation("Stock symbol {Symbol} not found in Twelve Data catalog", symbol);
                return VerificationResult.NotFound(AssetType, symbol);
            }

            // Symbol found - return first match
            var stock = stocksResponse.Data[0];

            _logger.LogInformation(
                "Stock symbol {Symbol} verified: {Name} on {Exchange} ({Currency})",
                symbol, stock.Name, stock.Exchange, stock.Currency);

            return VerificationResult.Success(
                AssetType,
                stock.Symbol,
                stock.Name,
                stock.Exchange,
                stock.Currency,
                stock.Country);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying stock symbol {Symbol}", symbol);
            return VerificationResult.Error(AssetType, symbol, $"Verification error: {ex.Message}");
        }
    }
}
