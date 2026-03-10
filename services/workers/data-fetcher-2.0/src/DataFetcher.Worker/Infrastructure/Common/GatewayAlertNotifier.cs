using System.Net.Http.Json;
using DataFetcher.Worker.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Infrastructure.Common;

public class GatewayAlertNotifier : IGatewayAlertNotifier
{
    private readonly HttpClient _httpClient;
    private readonly GatewaySettings _settings;
    private readonly ILogger<GatewayAlertNotifier> _logger;

    public GatewayAlertNotifier(
        HttpClient httpClient,
        IOptions<GatewaySettings> settings,
        ILogger<GatewayAlertNotifier> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task NotifyAsync(string assetType, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_settings.BaseUrl))
        {
            _logger.LogDebug("Gateway BaseUrl not configured, skipping alert check");
            return;
        }

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(30));

            var url = $"{_settings.BaseUrl.TrimEnd('/')}/internal/check-recommendations";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("X-Service-Key", _settings.InternalServiceKey);
            request.Content = JsonContent.Create(new { assetType });

            var response = await _httpClient.SendAsync(request, cts.Token);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Alert check completed for {AssetType}", assetType);
            }
            else
            {
                _logger.LogWarning("Alert check returned {StatusCode} for {AssetType}",
                    (int)response.StatusCode, assetType);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to notify gateway for alert check ({AssetType}) — non-fatal", assetType);
        }
    }
}
